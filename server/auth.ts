import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';

export interface AuthContext {
  userId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  isGuest: boolean;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const GUEST_ID_REGEX = /^gst_[a-zA-Z0-9_-]{8,64}$/;

export const PRODUCTION_PROJECT_ID = 'gen-lang-client-0390447756';

let cachedProjectId: string | null = null;
let certCache: { certs: Record<string, string>; expiresAt: number } = {
  certs: {},
  expiresAt: 0,
};

export function resetCachedProjectIdForTests(): void {
  cachedProjectId = null;
}

export function resolveServerFirebaseProjectId(): string {
  const vercelEnv = process.env.VERCEL_ENV || '';
  const appEnv = process.env.APP_ENV || '';
  const isPreview = vercelEnv === 'preview' || appEnv === 'preview';

  const backendProjId = process.env.FIREBASE_PROJECT_ID;
  const frontendProjId = process.env.VITE_FIREBASE_PROJECT_ID;

  // Enforce agreement between backend and frontend env vars if both provided
  if (backendProjId && frontendProjId && backendProjId !== frontendProjId) {
    throw new Error(
      `[CONFIG_DISAGREEMENT] Backend FIREBASE_PROJECT_ID (${backendProjId}) does not match frontend VITE_FIREBASE_PROJECT_ID (${frontendProjId})`
    );
  }

  const explicitProjId = backendProjId || frontendProjId;

  // Staging isolation gate for Preview
  if (isPreview) {
    if (!explicitProjId) {
      throw new Error(
        '[PREVIEW_STAGING_CONFIG_MISSING] Vercel Preview requires explicit Staging FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID. Automatic fallback to Production Firebase is blocked.'
      );
    }
    if (explicitProjId === PRODUCTION_PROJECT_ID) {
      throw new Error(
        `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use Production Firebase Project (${PRODUCTION_PROJECT_ID}). Preview must use a dedicated Staging Firebase Project.`
      );
    }
    return explicitProjId;
  }

  if (explicitProjId) {
    return explicitProjId;
  }

  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { projectId?: string };
      if (parsed.projectId) {
        return parsed.projectId;
      }
    }
  } catch {
    // fallback handled below
  }
  return PRODUCTION_PROJECT_ID;
}

function resolveFirebaseProjectId(): string {
  if (cachedProjectId && process.env.NODE_ENV !== 'test') return cachedProjectId;
  const resolved = resolveServerFirebaseProjectId();
  if (process.env.NODE_ENV !== 'test') {
    cachedProjectId = resolved;
  }
  return resolved;
}

async function getGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && Object.keys(certCache.certs).length > 0 && now < certCache.expiresAt) {
    return certCache.certs;
  }

  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google public certificates (${response.status})`);
  }

  const certs = (await response.json()) as Record<string, string>;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) * 1000 : 3600 * 1000;

  certCache = {
    certs,
    expiresAt: now + ttlMs,
  };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as T;
}

function decodeBase64UrlBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

interface FirebaseJwtHeader {
  alg?: string;
  kid?: string;
}

interface FirebaseJwtPayload {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  email?: string;
  name?: string;
  picture?: string;
}

export async function verifyFirebaseIdToken(token: string): Promise<AuthContext> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeBase64UrlJson<FirebaseJwtHeader>(headerB64);
  const payload = decodeBase64UrlJson<FirebaseJwtPayload>(payloadB64);

  const isProduction = process.env.NODE_ENV === 'production';
  const isEmulatorEnv =
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    process.env.NODE_ENV === 'test' ||
    process.env.ALLOW_EMULATOR_AUTH === 'true';

  // Support Firebase Auth emulator 'none' algorithm tokens strictly in test/emulator environments
  if (header.alg === 'none' && !sigB64) {
    if (isProduction) {
      throw new Error('Unsigned tokens are strictly forbidden in production');
    }
    if (!isEmulatorEnv) {
      throw new Error('Emulator tokens are only permitted when Firebase emulator host is configured');
    }
    const projectId = resolveFirebaseProjectId();
    const nowSec = Math.floor(Date.now() / 1000);
    const validAuds = new Set([
      projectId,
      'test-rules-project',
      'seismic-codex-m01dl',
      'gen-lang-client-0390447756',
    ]);
    if (payload.aud && !validAuds.has(payload.aud)) {
      throw new Error('Token audience mismatch');
    }
    if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
      throw new Error('Invalid token subject');
    }
    if (typeof payload.exp === 'number' && payload.exp <= nowSec - 30) {
      throw new Error('Token expired');
    }
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      avatarUrl: typeof payload.picture === 'string' ? payload.picture : undefined,
      isGuest: payload.sub.startsWith('gst_') || Boolean((payload as any).isGuest),
    };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported JWT algorithm or missing key ID');
  }

  let certs = await getGooglePublicCerts(false);
  let pem = certs[header.kid];
  if (!pem) {
    certs = await getGooglePublicCerts(true);
    pem = certs[header.kid];
  }
  if (!pem) {
    throw new Error('Signing certificate not found for token key ID');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signatureValid = verifier.verify(pem, decodeBase64UrlBuffer(sigB64));
  if (!signatureValid) {
    throw new Error('Invalid JWT signature');
  }

  const projectId = resolveFirebaseProjectId();
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId) {
    throw new Error('Token audience mismatch');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Token issuer mismatch');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Invalid token subject');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec - 30) {
    throw new Error('Token expired');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Token issued in the future');
  }

  return {
    userId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : undefined,
    isGuest: false,
  };
}

/**
 * Express authentication & tenant isolation middleware.
 * - Verifies `Authorization: Bearer <firebase-id-token>` cryptographically whenever sent.
 * - Rejects malformed/expired Bearer tokens cleanly with 401.
 * - In production: fails closed; unverified tokens can NEVER authenticate requests.
 * - When `REQUIRE_AUTH=true` or in production, requires an authenticated session.
 * - Otherwise scopes unauthenticated sessions cleanly by validated `x-demo-session` token
 *   instead of relying on a hardcoded spoofable `x-user-id` header.
 */
export async function requireUserContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if ((req as AuthenticatedRequest).auth) {
    next();
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const authHeader = req.headers.authorization;

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Missing authentication bearer token', code: 'AUTH_REQUIRED' });
      return;
    }

    try {
      const verified = await verifyFirebaseIdToken(token);
      (req as AuthenticatedRequest).auth = verified;
      const claimedUid = req.headers['x-user-id'];
      if (typeof claimedUid === 'string' && claimedUid.trim() && claimedUid.trim() !== verified.userId) {
        res.status(403).json({ error: 'Tenant isolation violation: x-user-id does not match verified token subject' });
        return;
      }
      next();
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unauthorized';
      // Production MUST fail closed: unverified tokens are never accepted
      res.status(401).json({ error: `Authentication failed: ${message}`, code: 'AUTH_REQUIRED' });
      return;
    }
  }

  // Enforce authentication: in production, or when explicitly requested
  if (process.env.REQUIRE_AUTH === 'true' || (isProduction && process.env.ALLOW_GUEST !== 'true')) {
    res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  const demoSessionHeader = req.headers['x-demo-session'];
  let demoSessionId: string;

  if (typeof demoSessionHeader === 'string' && GUEST_ID_REGEX.test(demoSessionHeader.trim())) {
    demoSessionId = demoSessionHeader.trim();
  } else if (!isProduction && process.env.DEMO_MODE === 'shared') {
    // Shared demo mode strictly forbidden in production deployments
    demoSessionId = 'usr_atif_default';
  } else {
    // Generate an isolated guest ID keyed to client characteristics
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'localhost';
    const clientUa = req.headers['user-agent'] || 'generic';
    const hash = crypto.createHash('sha256').update(`${clientIp}:${clientUa}`).digest('hex').slice(0, 16);
    demoSessionId = `gst_${hash}`;
  }

  (req as AuthenticatedRequest).auth = {
    userId: demoSessionId,
    isGuest: true,
  };
  next();
}
