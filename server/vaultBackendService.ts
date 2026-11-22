import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dbService } from './db.ts';
import type {
  JointVault,
  VaultInvitation,
  VaultMember,
  VaultActivity,
  VaultSummary,
  VaultContribution,
  VaultExpense,
  VaultSettlement,
} from '../src/types/index.ts';
import { buildVaultSummary } from '../src/lib/vaultIntelligence.ts';

export class VaultServiceError extends Error {
  public status: number;
  public code: string;
  constructor(message: string, status = 400, code = 'VAULT_ERROR') {
    super(message);
    this.name = 'VaultServiceError';
    this.status = status;
    this.code = code;
  }
}

export interface ServiceAccountConfig {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedServiceAccount: ServiceAccountConfig | null = null;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;
let testingOverrideServiceAccount: ServiceAccountConfig | null | undefined = undefined;

export function __setServiceAccountForTesting(sa: ServiceAccountConfig | null | undefined): void {
  testingOverrideServiceAccount = sa;
  cachedAccessToken = null;
  cachedServiceAccount = null;
}

export function parseServiceAccountString(raw?: string): ServiceAccountConfig | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: any = null;

  // 1. Try parsing directly as raw JSON (handles pretty or minified JSON)
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // 2. If raw JSON parsing fails, attempt Base64 decoding
    try {
      // Strip any whitespace, line breaks, or column wrapping (e.g. from standard base64 CLI output)
      const cleanB64 = trimmed.replace(/\s+/g, '');
      const decoded = Buffer.from(cleanB64, 'base64').toString('utf-8');
      parsed = JSON.parse(decoded);
    } catch {
      // Both raw JSON and Base64 parsing failed
      console.warn('[vaultBackendService] Failed to parse service account JSON from environment');
      return null;
    }
  }

  // 3. Validate parsed structure
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const client_email = typeof parsed.client_email === 'string' ? parsed.client_email.trim() : '';
  let private_key = typeof parsed.private_key === 'string' ? parsed.private_key : '';
  const project_id =
    typeof parsed.project_id === 'string' && parsed.project_id.trim()
      ? parsed.project_id.trim()
      : resolveFirebaseProjectIdFallback();

  if (!client_email || !private_key) {
    console.warn('[vaultBackendService] Service account JSON missing required fields (client_email or private_key)');
    return null;
  }

  // 4. Normalize escaped newlines in private key
  if (private_key.includes('\\n')) {
    private_key = private_key.replace(/\\n/g, '\n');
  }

  return {
    client_email,
    private_key,
    project_id,
  };
}

export function resolveServiceAccount(): ServiceAccountConfig | null {
  if (testingOverrideServiceAccount !== undefined) {
    return testingOverrideServiceAccount;
  }
  if (cachedServiceAccount) return cachedServiceAccount;

  // 1. Check supported environment variables (without logging their values)
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT,
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    process.env.FIREBASE_ADMIN_CREDENTIALS,
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  ];

  for (const envVal of candidates) {
    const parsed = parseServiceAccountString(envVal);
    if (parsed) {
      cachedServiceAccount = parsed;
      return cachedServiceAccount;
    }
  }

  // 2. Check GOOGLE_APPLICATION_CREDENTIALS file path
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    try {
      const raw = fs.readFileSync(credPath, 'utf-8');
      const parsed = parseServiceAccountString(raw);
      if (parsed) {
        cachedServiceAccount = parsed;
        return cachedServiceAccount;
      }
    } catch {
      console.warn('[vaultBackendService] Failed to read credentials file from GOOGLE_APPLICATION_CREDENTIALS');
    }
  }

  return null;
}

export const PRODUCTION_PROJECT_ID = 'focus-flow-by-atif';
export const PRODUCTION_DATABASE_ID = '(default)';

function resolveFirebaseProjectIdFallback(): string {
  const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || process.env.VITE_APP_ENV || '').trim().toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();

  const backendProjId = process.env.FIREBASE_PROJECT_ID;
  const frontendProjId = process.env.VITE_FIREBASE_PROJECT_ID;

  if (backendProjId && frontendProjId && backendProjId !== frontendProjId) {
    throw new Error(
      `[CONFIG_DISAGREEMENT] Backend FIREBASE_PROJECT_ID (${backendProjId}) does not match frontend VITE_FIREBASE_PROJECT_ID (${frontendProjId})`
    );
  }

  const explicitProjId = backendProjId || frontendProjId;

  // Rule 4: Conflicting Configuration Check
  if (vercelEnv && appEnv) {
    if (vercelEnv === 'preview' && appEnv === 'production') {
      throw new Error(
        "[CONFIG_CONFLICT] Vercel environment ('preview') conflicts with APP_ENV ('production'). Preview deployment cannot be overridden to production."
      );
    }
    if (vercelEnv === 'production' && appEnv === 'preview') {
      throw new Error(
        "[CONFIG_CONFLICT] Vercel environment ('production') conflicts with APP_ENV ('preview'). Conflicting environment flags are strictly forbidden."
      );
    }
  }

  // Rule 3: Vercel Authoritative Environment Routing
  if (isVercel) {
    if (
      !vercelEnv ||
      (vercelEnv !== 'production' && vercelEnv !== 'preview' && vercelEnv !== 'development')
    ) {
      throw new Error(
        `[VERCEL_ENVIRONMENT_UNRECOGNIZED] Running on Vercel deployment but VERCEL_ENV is missing or unrecognized ('${vercelEnv}'). Cannot safely determine deployment tier.`
      );
    }

    if (vercelEnv === 'preview') {
      if (!explicitProjId) {
        throw new Error(
          '[PREVIEW_STAGING_CONFIG_MISSING] Vercel Preview requires explicit Staging FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID. Automatic fallback to Production Firebase is blocked.'
        );
      }
      if (
        explicitProjId === PRODUCTION_PROJECT_ID ||
        explicitProjId === 'focus-flow-by-atif' ||
        explicitProjId === 'seismic-codex-m01dl' ||
        explicitProjId === 'gen-lang-client-0390447756'
      ) {
        throw new Error(
          `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firebase Project (${explicitProjId}). Preview must use a dedicated Staging Firebase Project.`
        );
      }
      return explicitProjId;
    }

    if (vercelEnv === 'production') {
      if (explicitProjId) return explicitProjId;
      return PRODUCTION_PROJECT_ID;
    }

    if (vercelEnv === 'development' && explicitProjId) {
      return explicitProjId;
    }
  }

  if (appEnv === 'preview') {
    if (!explicitProjId) {
      throw new Error(
        '[PREVIEW_STAGING_CONFIG_MISSING] Preview requires explicit Staging FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID. Automatic fallback to Production Firebase is blocked.'
      );
    }
    if (
      explicitProjId === PRODUCTION_PROJECT_ID ||
      explicitProjId === 'focus-flow-by-atif' ||
      explicitProjId === 'seismic-codex-m01dl' ||
      explicitProjId === 'gen-lang-client-0390447756'
    ) {
      throw new Error(
        `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firebase Project (${explicitProjId}). Preview must use a dedicated Staging Firebase Project.`
      );
    }
    return explicitProjId;
  }

  if (explicitProjId) return explicitProjId;
  if (nodeEnv === 'test') return 'test-rules-project';

  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { projectId?: string };
      if (parsed.projectId) return parsed.projectId;
    }
  } catch {
    // fallback below
  }
  return PRODUCTION_PROJECT_ID;
}

export function resolveFirestoreDatabaseId(): string {
  const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const appEnv = (process.env.APP_ENV || process.env.VITE_APP_ENV || '').trim().toLowerCase();
  const explicitDb = process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID;

  if (isVercel) {
    if (
      !vercelEnv ||
      (vercelEnv !== 'production' && vercelEnv !== 'preview' && vercelEnv !== 'development')
    ) {
      throw new Error(
        `[VERCEL_ENVIRONMENT_UNRECOGNIZED] Running on Vercel deployment but VERCEL_ENV is missing or unrecognized ('${vercelEnv}'). Cannot safely determine deployment tier.`
      );
    }

    if (vercelEnv === 'preview') {
      if (!explicitDb) {
        throw new Error(
          '[PREVIEW_STAGING_CONFIG_MISSING] Vercel Preview requires explicit Staging VITE_FIREBASE_DATABASE_ID. Automatic fallback to Production Firestore Database is blocked.'
        );
      }
      if (explicitDb === PRODUCTION_DATABASE_ID) {
        throw new Error(
          `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firestore Database (${PRODUCTION_DATABASE_ID}). Preview must use a dedicated Staging Firestore Database.`
        );
      }
      return explicitDb;
    }

    if (vercelEnv === 'production') {
      if (explicitDb) return explicitDb;
      return PRODUCTION_DATABASE_ID;
    }

    if (vercelEnv === 'development' && explicitDb) {
      return explicitDb;
    }
  }

  if (appEnv === 'preview') {
    if (!explicitDb) {
      throw new Error(
        '[PREVIEW_STAGING_CONFIG_MISSING] Preview requires explicit Staging VITE_FIREBASE_DATABASE_ID. Automatic fallback to Production Firestore Database is blocked.'
      );
    }
    if (explicitDb === PRODUCTION_DATABASE_ID) {
      throw new Error(
        `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firestore Database (${PRODUCTION_DATABASE_ID}). Preview must use a dedicated Staging Firestore Database.`
      );
    }
    return explicitDb;
  }

  if (explicitDb) {
    return explicitDb;
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
  return PRODUCTION_DATABASE_ID;
}

export function resolveProjectId(serviceAccount?: ServiceAccountConfig | null): string {
  if (serviceAccount?.project_id) return serviceAccount.project_id;
  return resolveFirebaseProjectIdFallback();
}

export async function getGoogleOAuthAccessToken(sa: ServiceAccountConfig): Promise<string> {
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

// Convert Firestore REST values to plain JS objects
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

// Convert plain JS objects to Firestore REST values
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

// Firestore REST ACID Transaction Helpers
async function beginFirestoreTransaction(token: string, baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}:beginTransaction`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to begin Firestore transaction (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { transaction: string };
  return data.transaction;
}

async function rollbackFirestoreTransaction(token: string, baseUrl: string, transactionId: string): Promise<void> {
  try {
    await fetch(`${baseUrl}:rollback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction: transactionId }),
    });
  } catch {
    // Non-fatal rollback swallow
  }
}

async function commitFirestoreTransaction(
  token: string,
  baseUrl: string,
  transactionId: string,
  writes: any[]
): Promise<any> {
  const res = await fetch(`${baseUrl}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transaction: transactionId,
      writes,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const isAborted = res.status === 409 || text.includes('ABORTED') || text.includes('aborted');
    const err = new VaultServiceError(
      isAborted
        ? 'Transaction was aborted due to concurrent modification. Please retry.'
        : `Firestore transaction commit failed (${res.status}): ${text}`,
      isAborted ? 409 : res.status,
      isAborted ? 'CONCURRENT_MODIFICATION' : 'TRANSACTION_COMMIT_FAILED'
    );
    throw err;
  }
  return await res.json();
}

export class VaultBackendService {
  public isFirestoreConfigured(): boolean {
    return resolveServiceAccount() !== null;
  }

  private ensureConfigured(isGuest?: boolean): ServiceAccountConfig {
    const sa = resolveServiceAccount();
    if (!sa) {
      if (isGuest) {
        throw new Error('Local database mode');
      }
      throw new VaultServiceError(
        'Firebase Admin credentials are not configured on the server. Please configure FIREBASE_SERVICE_ACCOUNT in your environment to enable Joint Vault operations.',
        503,
        'FIREBASE_ADMIN_NOT_CONFIGURED'
      );
    }
    return sa;
  }

  /**
   * Accepts a vault invitation transactionally.
   * Guarantees strict single-use, idempotency, email validation, and capacity enforcement.
   */
  public async acceptVaultInvitation(
    inviteCode: string,
    user: { id: string; email?: string; name?: string; isGuest?: boolean }
  ): Promise<{ vault: JointVault; invitation: VaultInvitation }> {
    const code = (inviteCode || '').trim().toUpperCase();
    if (!code) {
      throw new VaultServiceError('Invite code is required', 400, 'INVALID_CODE');
    }

    if (user.isGuest) {
      return dbService.acceptVaultInvitation(code, user);
    }

    const sa = this.ensureConfigured(user.isGuest);
    const token = await getGoogleOAuthAccessToken(sa);
    const projectId = resolveProjectId(sa);
    const databaseId = resolveFirestoreDatabaseId();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      let txId = '';
      try {
        txId = await beginFirestoreTransaction(token, baseUrl);

        // 1. Query collectionGroup 'invitations' inside the transaction
        const queryUrl = `${baseUrl}:runQuery`;
        const queryBody = {
          transaction: txId,
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
          throw new VaultServiceError(`Firestore query failed (${queryRes.status}): ${errText}`, 500);
        }

        const queryResults = (await queryRes.json()) as any[];
        const firstResult = queryResults.find((r) => r.document);
        if (!firstResult || !firstResult.document) {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('Invalid invitation code. Please verify the code and retry.', 400, 'INVALID_CODE');
        }

        const inviteDoc = firstResult.document;
        const inviteData = fromFirestoreDoc(inviteDoc) as VaultInvitation;
        const invitePath: string = inviteDoc.name;

        const pathMatch = invitePath.match(/documents\/sharedVaults\/([^/]+)\/invitations\/([^/]+)$/);
        if (!pathMatch) {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('Malformed invitation document path', 500);
        }
        const vaultId = pathMatch[1];

        // 2. Fetch target vault document within transaction
        const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}?transaction=${encodeURIComponent(txId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!vaultRes.ok) {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('Target vault not found or inaccessible', 404, 'VAULT_NOT_FOUND');
        }
        const vaultDoc = await vaultRes.json();
        const vaultData = fromFirestoreDoc(vaultDoc) as JointVault;

        // Idempotency check: If already accepted by the exact same account
        if (inviteData.status === 'accepted') {
          const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
          if (currentMembers.includes(user.id) && inviteData.acceptedByUid === user.id) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
            return { vault: vaultData, invitation: inviteData };
          }
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('This invitation code has already been used and is no longer valid.', 400, 'INVITATION_ALREADY_USED');
        }

        if (inviteData.status === 'revoked') {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('This invitation code has been revoked. Please ask your partner to generate a new code.', 400, 'INVITATION_REVOKED');
        }

        if (inviteData.status !== 'pending') {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('This invitation code is no longer valid.', 400, 'INVITATION_INVALID');
        }

        const now = new Date();
        if (inviteData.expiresAt && new Date(inviteData.expiresAt) <= now) {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('This invitation code has expired. Please ask your partner to generate a new one.', 400, 'INVITATION_EXPIRED');
        }

        // Enforce intended recipient email match if specified
        if (inviteData.invitedEmail) {
          const normalizedInvited = inviteData.invitedEmail.trim().toLowerCase();
          const normalizedUser = (user.email || '').trim().toLowerCase();
          if (!normalizedUser || normalizedInvited !== normalizedUser) {
            await rollbackFirestoreTransaction(token, baseUrl, txId);
            throw new VaultServiceError('This invitation was sent to a different email address.', 400, 'EMAIL_MISMATCH');
          }
        }

        if (vaultData.status !== 'active') {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('Target vault not found or archived', 400, 'VAULT_INACTIVE');
        }

        const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
        if (currentMembers.includes(user.id)) {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('You are already an active member of this vault.', 400, 'ALREADY_MEMBER');
        }
        if (currentMembers.length >= 2) {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
          throw new VaultServiceError('This vault already has the maximum of 2 active partners.', 400, 'VAULT_FULL');
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

        const writes = [
          // 1. Update Vault root document
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
          // 2. Update Invitation status
          {
            update: {
              name: invitePath,
              fields: {
                ...inviteDoc.fields,
                status: { stringValue: 'accepted' },
                acceptedByUid: { stringValue: user.id },
                acceptedAt: { stringValue: nowIso },
                updatedAt: { stringValue: nowIso },
              },
            },
            updateMask: { fieldPaths: ['status', 'acceptedByUid', 'acceptedAt', 'updatedAt'] },
          },
          // 3. Create Member subcollection doc
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
          // 4. Create Activity subcollection doc
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

        await commitFirestoreTransaction(token, baseUrl, txId, writes);

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
      } catch (err: any) {
        if (err?.code === 'CONCURRENT_MODIFICATION' && attempts < 2) {
          // Jittered short backoff and retry
          await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
          continue;
        }
        if (txId) {
          await rollbackFirestoreTransaction(token, baseUrl, txId);
        }
        throw err;
      }
    }

    throw new VaultServiceError('Concurrent modification detected. Please retry.', 409, 'CONCURRENT_MODIFICATION');
  }

  /**
   * Leaves a vault transactionally.
   * If user is the only member, returns HTTP 409 LAST_MEMBER_MUST_ARCHIVE.
   * When >1 members exist, marks member as 'left', updates memberUids, preserves all historical financial data.
   */
  public async leaveVault(
    vaultId: string,
    user: { id: string; email?: string; name?: string; isGuest?: boolean }
  ): Promise<{ success: boolean; vaultId: string; remainingMembers: string[] }> {
    if (user.isGuest) {
      try {
        const success = dbService.leaveVault(vaultId, user.id);
        const vault = dbService.getVaultSummary(vaultId, user.id)?.vault;
        return { success, vaultId, remainingMembers: vault?.memberUids || [] };
      } catch (err: any) {
        if (String(err?.message || '').toLowerCase().includes('archive')) {
          throw new VaultServiceError(
            err.message || 'Single remaining member cannot leave vault. Please archive the vault instead.',
            409,
            'LAST_MEMBER_MUST_ARCHIVE'
          );
        }
        throw err;
      }
    }

    const sa = this.ensureConfigured(user.isGuest);
    const token = await getGoogleOAuthAccessToken(sa);
    const projectId = resolveProjectId(sa);
    const databaseId = resolveFirestoreDatabaseId();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

    let txId = '';
    try {
      txId = await beginFirestoreTransaction(token, baseUrl);

      const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}?transaction=${encodeURIComponent(txId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!vaultRes.ok) {
        await rollbackFirestoreTransaction(token, baseUrl, txId);
        throw new VaultServiceError('Vault not found or access denied', 404, 'VAULT_NOT_FOUND');
      }

      const vaultDoc = await vaultRes.json();
      const vaultData = fromFirestoreDoc(vaultDoc) as JointVault;
      const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];

      if (!currentMembers.includes(user.id)) {
        await rollbackFirestoreTransaction(token, baseUrl, txId);
        throw new VaultServiceError('User is not an active member of this vault', 403, 'NOT_A_MEMBER');
      }

      if (currentMembers.length <= 1) {
        await rollbackFirestoreTransaction(token, baseUrl, txId);
        throw new VaultServiceError(
          'Single remaining member cannot leave vault. Please archive the vault instead.',
          409,
          'LAST_MEMBER_MUST_ARCHIVE'
        );
      }

      const remainingMembers = currentMembers.filter((uid) => uid !== user.id);
      const nowIso = new Date().toISOString();
      const updatedRatio: Record<string, number> = { [remainingMembers[0]]: 100 };

      const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const activity: VaultActivity = {
        id: activityId,
        vaultId,
        actorUid: user.id,
        actorName: user.name || 'Member',
        type: 'member_left',
        title: 'Member Left Vault',
        description: `${user.name || 'Member'} left the vault`,
        timestamp: nowIso,
      };

      const writes = [
        // 1. Update Vault root document
        {
          update: {
            name: vaultDoc.name,
            fields: {
              ...vaultDoc.fields,
              memberUids: toFirestoreValue(remainingMembers),
              targetRatio: toFirestoreValue(updatedRatio),
              updatedAt: { stringValue: nowIso },
            },
          },
          updateMask: { fieldPaths: ['memberUids', 'targetRatio', 'updatedAt'] },
        },
        // 2. Update Member subcollection document to status 'left'
        {
          update: {
            name: `${baseUrl}/sharedVaults/${vaultId}/members/${user.id}`,
            fields: {
              status: { stringValue: 'left' },
              leftAt: { stringValue: nowIso },
              updatedAt: { stringValue: nowIso },
            },
          },
          updateMask: { fieldPaths: ['status', 'leftAt', 'updatedAt'] },
        },
        // 3. Log activity
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

      await commitFirestoreTransaction(token, baseUrl, txId, writes);
      return { success: true, vaultId, remainingMembers };
    } catch (err) {
      if (txId) {
        await rollbackFirestoreTransaction(token, baseUrl, txId);
      }
      throw err;
    }
  }

  /**
   * Archives a vault in Firestore or local database.
   */
  public async archiveVault(
    vaultId: string,
    user: { id: string; email?: string; name?: string; isGuest?: boolean }
  ): Promise<JointVault> {
    if (user.isGuest) {
      return dbService.archiveVault(vaultId, user.id);
    }

    const sa = this.ensureConfigured(user.isGuest);
    const token = await getGoogleOAuthAccessToken(sa);
    const projectId = resolveProjectId(sa);
    const databaseId = resolveFirestoreDatabaseId();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

    let txId = '';
    try {
      txId = await beginFirestoreTransaction(token, baseUrl);

      const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}?transaction=${encodeURIComponent(txId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!vaultRes.ok) {
        await rollbackFirestoreTransaction(token, baseUrl, txId);
        throw new VaultServiceError('Vault not found or access denied', 404, 'VAULT_NOT_FOUND');
      }

      const vaultDoc = await vaultRes.json();
      const vaultData = fromFirestoreDoc(vaultDoc) as JointVault;
      const currentMembers = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];

      if (!currentMembers.includes(user.id)) {
        await rollbackFirestoreTransaction(token, baseUrl, txId);
        throw new VaultServiceError('User is not an active member of this vault', 403, 'NOT_A_MEMBER');
      }

      const nowIso = new Date().toISOString();
      const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const activity: VaultActivity = {
        id: activityId,
        vaultId,
        actorUid: user.id,
        actorName: user.name || 'Member',
        type: 'vault_archived',
        title: 'Joint Vault Archived',
        description: `${user.name || 'Member'} archived the vault`,
        timestamp: nowIso,
      };

      const writes = [
        {
          update: {
            name: vaultDoc.name,
            fields: {
              ...vaultDoc.fields,
              status: { stringValue: 'archived' },
              archivedAt: { stringValue: nowIso },
              archivedByUid: { stringValue: user.id },
              updatedAt: { stringValue: nowIso },
            },
          },
          updateMask: { fieldPaths: ['status', 'archivedAt', 'archivedByUid', 'updatedAt'] },
        },
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

      await commitFirestoreTransaction(token, baseUrl, txId, writes);
      return {
        ...vaultData,
        status: 'archived',
        updatedAt: nowIso,
      };
    } catch (err) {
      if (txId) {
        await rollbackFirestoreTransaction(token, baseUrl, txId);
      }
      throw err;
    }
  }

  /**
   * Rejects an invitation.
   */
  public async rejectVaultInvitation(
    inviteCode: string,
    user: { id: string; email?: string; isGuest?: boolean }
  ): Promise<VaultInvitation> {
    const code = (inviteCode || '').trim().toUpperCase();
    if (!code) throw new VaultServiceError('Invite code is required', 400, 'INVALID_CODE');

    if (user.isGuest) {
      return dbService.rejectVaultInvitation(code, user);
    }

    const sa = this.ensureConfigured(user.isGuest);
    const token = await getGoogleOAuthAccessToken(sa);
    const projectId = resolveProjectId(sa);
    const databaseId = resolveFirestoreDatabaseId();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

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

    const queryResults = (await queryRes.json()) as any[];
    const firstResult = queryResults.find((r) => r.document);
    if (!firstResult || !firstResult.document) {
      throw new VaultServiceError('Invalid invitation code', 400, 'INVALID_CODE');
    }

    const inviteDoc = firstResult.document;
    const inviteData = fromFirestoreDoc(inviteDoc) as VaultInvitation;

    if (inviteData.status !== 'pending') {
      throw new VaultServiceError(
        `Invitation cannot be rejected because it is already ${inviteData.status}`,
        400,
        'INVITATION_INVALID'
      );
    }

    if (inviteData.invitedEmail) {
      const normalizedInvited = inviteData.invitedEmail.trim().toLowerCase();
      const normalizedUser = (user.email || '').trim().toLowerCase();
      if (!normalizedUser || normalizedInvited !== normalizedUser) {
        throw new VaultServiceError('This invitation was sent to a different email address', 403, 'EMAIL_MISMATCH');
      }
    }

    const nowIso = new Date().toISOString();

    const writes = [
      {
        update: {
          name: inviteDoc.name,
          fields: {
            ...inviteDoc.fields,
            status: { stringValue: 'rejected' },
            rejectedByUid: { stringValue: user.id },
            rejectedAt: { stringValue: nowIso },
            updatedAt: { stringValue: nowIso },
          },
        },
        updateMask: { fieldPaths: ['status', 'rejectedByUid', 'rejectedAt', 'updatedAt'] },
      },
    ];

    const commitRes = await fetch(`${baseUrl}:commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    if (!commitRes.ok) {
      const errText = await commitRes.text();
      throw new VaultServiceError(`Failed to reject vault invitation: ${errText}`, 500, 'FIRESTORE_COMMIT_FAILED');
    }

    return {
      ...inviteData,
      status: 'rejected',
      updatedAt: nowIso,
    };
  }

  /**
   * Revokes an invitation from a vault.
   */
  public async revokeVaultInvitation(
    vaultId: string,
    inviteId: string,
    user: { id: string; isGuest?: boolean }
  ): Promise<{ success: boolean }> {
    if (user.isGuest) {
      const success = dbService.revokeVaultInvitation(vaultId, inviteId, user.id);
      return { success };
    }

    const sa = this.ensureConfigured(user.isGuest);
    const token = await getGoogleOAuthAccessToken(sa);
    const projectId = resolveProjectId(sa);
    const databaseId = resolveFirestoreDatabaseId();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

    // 1. Verify user is vault member
    const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!vaultRes.ok) throw new VaultServiceError('Vault not found', 404, 'VAULT_NOT_FOUND');
    const vaultDoc = await vaultRes.json();
    const vaultData = fromFirestoreDoc(vaultDoc) as JointVault;
    if (!vaultData.memberUids.includes(user.id)) {
      throw new VaultServiceError('Unauthorized to revoke invitations for this vault', 403, 'UNAUTHORIZED');
    }

    const nowIso = new Date().toISOString();
    const writes = [
      {
        update: {
          name: `${baseUrl}/sharedVaults/${vaultId}/invitations/${inviteId}`,
          fields: {
            status: { stringValue: 'revoked' },
            revokedAt: { stringValue: nowIso },
            updatedAt: { stringValue: nowIso },
          },
        },
        updateMask: { fieldPaths: ['status', 'revokedAt', 'updatedAt'] },
      },
    ];

    const commitRes = await fetch(`${baseUrl}:commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    return { success: commitRes.ok };
  }

  /**
   * Reverses a vault expense.
   */
  public async reverseVaultExpense(
    vaultId: string,
    expenseId: string,
    user: { id: string; isGuest?: boolean },
    reason?: string
  ): Promise<any> {
    if (user.isGuest) {
      return dbService.reverseVaultExpense(vaultId, expenseId, user.id);
    }

    const sa = this.ensureConfigured(user.isGuest);
    const token = await getGoogleOAuthAccessToken(sa);
    const projectId = resolveProjectId(sa);
    const databaseId = resolveFirestoreDatabaseId();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

    // 1. Verify vault exists and user is an active member
    const vaultRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!vaultRes.ok) {
      throw new VaultServiceError('Vault not found', 404, 'VAULT_NOT_FOUND');
    }
    const vaultDoc = await vaultRes.json();
    const vaultData = fromFirestoreDoc(vaultDoc) as any;
    const memberUids: string[] = Array.isArray(vaultData.memberUids) ? vaultData.memberUids : [];
    if (!memberUids.includes(user.id)) {
      throw new VaultServiceError('User is not an active member of this vault', 403, 'NOT_A_MEMBER');
    }

    // 2. Verify expense exists and is not already reversed
    const expenseRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}/expenses/${expenseId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!expenseRes.ok) {
      throw new VaultServiceError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }
    const expenseDoc = await expenseRes.json();
    const expenseData = fromFirestoreDoc(expenseDoc) as any;
    if (expenseData.status === 'reversed') {
      throw new VaultServiceError('Expense has already been reversed', 400, 'ALREADY_REVERSED');
    }

    const nowIso = new Date().toISOString();
    const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const writes = [
      {
        update: {
          name: `${baseUrl}/sharedVaults/${vaultId}/expenses/${expenseId}`,
          fields: {
            status: { stringValue: 'reversed' },
            reversedAt: { stringValue: nowIso },
            reversedByUid: { stringValue: user.id },
            reversalReason: { stringValue: reason || 'Reversed by member' },
            updatedAt: { stringValue: nowIso },
          },
        },
        updateMask: { fieldPaths: ['status', 'reversedAt', 'reversedByUid', 'reversalReason', 'updatedAt'] },
      },
      {
        update: {
          name: `${baseUrl}/sharedVaults/${vaultId}/activity/${activityId}`,
          fields: {
            id: { stringValue: activityId },
            vaultId: { stringValue: vaultId },
            actorUid: { stringValue: user.id },
            actorName: { stringValue: 'Member' },
            type: { stringValue: 'expense_reversed' },
            title: { stringValue: 'Joint Expense Reversed' },
            description: { stringValue: reason || 'Expense was reversed' },
            timestamp: { stringValue: nowIso },
          },
        },
      },
    ];

    const commitRes = await fetch(`${baseUrl}:commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    if (!commitRes.ok) {
      const errText = await commitRes.text();
      throw new VaultServiceError(`Failed to reverse vault expense: ${errText}`, 500, 'FIRESTORE_COMMIT_FAILED');
    }

    return { success: true };
  }

  /**
   * Fetches full vault summary including subcollections.
   */
  public async getVaultSummary(vaultId: string, userId: string): Promise<VaultSummary | null> {
    const sa = resolveServiceAccount();
    if (!sa) {
      return dbService.getVaultSummary(vaultId, userId);
    }

    const token = await getGoogleOAuthAccessToken(sa);
    const projectId = resolveProjectId(sa);
    const databaseId = resolveFirestoreDatabaseId();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

    try {
      const vRes = await fetch(`${baseUrl}/sharedVaults/${vaultId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!vRes.ok) return null;
      const vDoc = await vRes.json();
      const vault = fromFirestoreDoc(vDoc) as JointVault;
      if (!vault.memberUids || !vault.memberUids.includes(userId)) return null;

      // Fetch subcollections in parallel
      const fetchList = async (col: string): Promise<any[]> => {
        const res = await fetch(`${baseUrl}/sharedVaults/${vaultId}/${col}?pageSize=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.documents || []).map(fromFirestoreDoc);
      };

      const [members, contributions, expenses, settlements, activities] = await Promise.all([
        fetchList('members'),
        fetchList('contributions'),
        fetchList('expenses'),
        fetchList('settlements'),
        fetchList('activity'),
      ]);

      const activeMembers = (members as VaultMember[]).filter((m) => m.status === 'active');
      const activeContributions = (contributions as VaultContribution[]).filter((c) => c.status === 'active');
      const activeExpenses = (expenses as VaultExpense[]).filter((e) => e.status === 'active');

      return buildVaultSummary(
        vault,
        activeMembers,
        activeContributions,
        activeExpenses,
        settlements as VaultSettlement[],
        activities as VaultActivity[]
      );
    } catch (err) {
      console.warn('[vaultBackendService] getVaultSummary error:', err);
      return dbService.getVaultSummary(vaultId, userId);
    }
  }
}

export const vaultBackendService = new VaultBackendService();
