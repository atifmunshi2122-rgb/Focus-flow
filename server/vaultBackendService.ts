import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dbService } from './db.ts';
import type { JointVault, VaultInvitation, VaultMember, VaultActivity, VaultSummary } from '../src/types/index.ts';

interface ServiceAccountConfig {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedServiceAccount: ServiceAccountConfig | null = null;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function resolveServiceAccount(): ServiceAccountConfig | null {
  if (cachedServiceAccount) return cachedServiceAccount;

  // 1. Check FIREBASE_SERVICE_ACCOUNT environment variable (JSON string)
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson) as ServiceAccountConfig;
      if (parsed.client_email && parsed.private_key) {
        cachedServiceAccount = parsed;
        return cachedServiceAccount;
      }
    } catch (err) {
      console.warn('[vaultBackendService] Failed to parse service account JSON from environment:', err);
    }
  }

  // 2. Check GOOGLE_APPLICATION_CREDENTIALS file path
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    try {
      const raw = fs.readFileSync(credPath, 'utf-8');
      const parsed = JSON.parse(raw) as ServiceAccountConfig;
      if (parsed.client_email && parsed.private_key) {
        cachedServiceAccount = parsed;
        return cachedServiceAccount;
      }
    } catch (err) {
      console.warn('[vaultBackendService] Failed to load service account file:', err);
    }
  }

  return null;
}

function resolveFirestoreDatabaseId(): string {
  if (process.env.VITE_FIREBASE_DATABASE_ID) {
    return process.env.VITE_FIREBASE_DATABASE_ID;
  }
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { firestoreDatabaseId?: string };
      if (parsed.firestoreDatabaseId) return parsed.firestoreDatabaseId;
    }
  } catch {
    // fallback below
  }
  return 'ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8';
}

function resolveProjectId(serviceAccount?: ServiceAccountConfig | null): string {
  if (serviceAccount?.project_id) return serviceAccount.project_id;
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { projectId?: string };
      if (parsed.projectId) return parsed.projectId;
    }
  } catch {
    // fallback
  }
  return 'seismic-codex-m01dl';
}

async function getGoogleOAuthAccessToken(sa: ServiceAccountConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 300) {
    return cachedAccessToken.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(sa.private_key, 'base64url');
  const assertion = `${unsignedToken}.${signature}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', assertion);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to exchange service account JWT for access token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };
  return cachedAccessToken.token;
}

// Helper to convert Firestore REST values to plain JS objects
function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return val;
}

function fromFirestoreDoc(doc: any): Record<string, any> {
  const fields = doc.fields || {};
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    res[k] = fromFirestoreValue(v);
  }
  return res;
}

// Helper to convert plain JS objects to Firestore REST values
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export class VaultBackendService {
  public isFirestoreConfigured(): boolean {
    return resolveServiceAccount() !== null;
  }

  public async acceptVaultInvitation(
    inviteCode: string,
    user: { id: string; email?: string; name?: string }
  ): Promise<{ vault: JointVault; invitation: VaultInvitation }> {
    const sa = resolveServiceAccount();
    if (!sa) {
      // In local dev, test environments, or when service account is not provided,
      // fallback cleanly to local dbService to preserve 100% test suite compatibility.
      return dbService.acceptVaultInvitation(inviteCode, user);
    }

    const token = await getGoogleOAuthAccessToken(sa);
    const projectId = resolveProjectId(sa);
    const databaseId = resolveFirestoreDatabaseId();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
    const code = inviteCode.trim().toUpperCase();

    // 1. Query collectionGroup 'invitations' for inviteCode
    const queryUrl = `${baseUrl}:runQuery`;
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'invitations', allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'inviteCode' },
            op: 'EQUAL',
            value: { stringValue: code },
          },
        },
        limit: 1,
      },
    };

    const queryRes = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryBody),
    });

    if (!queryRes.ok) {
      const errText = await queryRes.text();
      throw new Error(`Firestore query failed (${queryRes.status}): ${errText}`);
    }

    const queryResults = (await queryRes.json()) as any[];
    const firstResult = queryResults.find((r) => r.document);
    if (!firstResult || !firstResult.document) {
      throw new Error('Invalid or already processed invitation code');
    }

    const inviteDoc = firstResult.document;
    const inviteData = fromFirestoreDoc(inviteDoc) as VaultInvitation;
    const invitePath: string = inviteDoc.name; // projects/.../databases/.../documents/sharedVaults/{vaultId}/invitations/{inviteId}

    // Extract vaultId from document path
    const pathMatch = invitePath.match(/documents\/sharedVaults\/([^/]+)\/invitations\/([^/]+)$/);
    if (!pathMatch) {
      throw new Error('Malformed invitation document path');
    }
    const vaultId = pathMatch[1];
    const inviteId = pathMatch[2];

    // Fetch target vault document
    const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!vaultRes.ok) {
      throw new Error('Target vault not found or inaccessible');
    }
    const vaultDoc = await vaultRes.json();
    const vaultData = fromFirestoreDoc(vaultDoc) as JointVault;

    // Idempotency: If already accepted by the exact same account, return existing state
    if (inviteData.status === 'accepted') {
      const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
      if (currentMembers.includes(user.id) && inviteData.acceptedByUid === user.id) {
        return { vault: vaultData, invitation: inviteData };
      }
      throw new Error('This invitation code has already been processed or used, and is no longer valid.');
    }

    if (inviteData.status === 'revoked') {
      throw new Error('This invitation code has been revoked. Please ask your partner to generate a new code.');
    }

    if (inviteData.status !== 'pending') {
      throw new Error('Invalid or already processed invitation code');
    }

    const now = new Date();
    if (inviteData.expiresAt && new Date(inviteData.expiresAt) <= now) {
      // Mark as expired
      await fetch(`${baseUrl}:commit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: invitePath,
                fields: {
                  ...inviteDoc.fields,
                  status: { stringValue: 'expired' },
                },
              },
              updateMask: { fieldPaths: ['status'] },
            },
          ],
        }),
      });
      throw new Error('This invitation code has expired. Please ask your partner to generate a new one.');
    }

    // Enforce intended recipient email match if specified
    if (inviteData.invitedEmail) {
      const normalizedInvited = inviteData.invitedEmail.trim().toLowerCase();
      const normalizedUser = (user.email || '').trim().toLowerCase();
      if (!normalizedUser || normalizedInvited !== normalizedUser) {
        throw new Error('This invitation was sent to a different email address.');
      }
    }

    if (vaultData.status !== 'active') {
      throw new Error('Target vault not found or archived');
    }

    const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
    if (currentMembers.includes(user.id)) {
      throw new Error('You are already a member of this vault');
    }
    if (currentMembers.length >= 2) {
      throw new Error('Vault already has the maximum of 2 active members');
    }

    const nowIso = now.toISOString();
    const updatedMembers = [...currentMembers, user.id];
    const updatedRatio: Record<string, number> = {
      [vaultData.createdBy]: 50,
      [user.id]: 50,
    };

    const newMember: VaultMember = {
      uid: user.id,
      email: user.email || `${user.id}@focusflow.app`,
      name: user.name || 'Partner',
      role: 'partner',
      status: 'active',
      joinedAt: nowIso,
    };

    const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const activity: VaultActivity = {
      id: activityId,
      vaultId,
      actorUid: user.id,
      actorName: newMember.name,
      type: 'member_joined',
      title: 'Partner Joined Vault',
      description: `${newMember.name} joined "${vaultData.name}"`,
      timestamp: nowIso,
    };

    // 3. Perform atomic commit of all updates
    const commitUrl = `${baseUrl}:commit`;
    const writes = [
      // Update Vault
      {
        update: {
          name: vaultDoc.name,
          fields: {
            ...vaultDoc.fields,
            memberUids: toFirestoreValue(updatedMembers),
            targetRatio: toFirestoreValue(updatedRatio),
            updatedAt: { stringValue: nowIso },
          },
        },
        updateMask: { fieldPaths: ['memberUids', 'targetRatio', 'updatedAt'] },
      },
      // Update Invitation
      {
        update: {
          name: invitePath,
          fields: {
            ...inviteDoc.fields,
            status: { stringValue: 'accepted' },
            acceptedByUid: { stringValue: user.id },
            acceptedAt: { stringValue: nowIso },
          },
        },
        updateMask: { fieldPaths: ['status', 'acceptedByUid', 'acceptedAt'] },
      },
      // Create Member document
      {
        update: {
          name: `${baseUrl}/sharedVaults/${vaultId}/members/${user.id}`,
          fields: {
            uid: { stringValue: newMember.uid },
            email: { stringValue: newMember.email },
            name: { stringValue: newMember.name },
            role: { stringValue: newMember.role },
            status: { stringValue: newMember.status },
            joinedAt: { stringValue: newMember.joinedAt },
          },
        },
      },
      // Create Activity document
      {
        update: {
          name: `${baseUrl}/sharedVaults/${vaultId}/activity/${activityId}`,
          fields: {
            id: { stringValue: activity.id },
            vaultId: { stringValue: activity.vaultId },
            actorUid: { stringValue: activity.actorUid },
            actorName: { stringValue: activity.actorName },
            type: { stringValue: activity.type },
            title: { stringValue: activity.title },
            description: { stringValue: activity.description },
            timestamp: { stringValue: activity.timestamp },
          },
        },
      },
    ];

    const commitRes = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    if (!commitRes.ok) {
      const commitErr = await commitRes.text();
      throw new Error(`Failed to commit vault join transaction: ${commitErr}`);
    }

    const updatedVault: JointVault = {
      ...vaultData,
      memberUids: updatedMembers,
      targetRatio: updatedRatio,
      updatedAt: nowIso,
    };

    const updatedInvite: VaultInvitation = {
      ...inviteData,
      status: 'accepted',
      acceptedByUid: user.id,
      acceptedAt: nowIso,
    };

    return { vault: updatedVault, invitation: updatedInvite };
  }

  public async getVaultSummary(vaultId: string, userId: string): Promise<VaultSummary | null> {
    const sa = resolveServiceAccount();
    if (!sa) {
      return dbService.getVaultSummary(vaultId, userId);
    }
    // If running in Firestore mode, getVaultSummary via Firestore REST or dbService
    return dbService.getVaultSummary(vaultId, userId);
  }
}

export const vaultBackendService = new VaultBackendService();

