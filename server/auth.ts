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

let cachedProjectId: string | null = null;
let certCache: { certs: Record<string, string>; expiresAt: number } = {
  certs: {},
  expiresAt: 0,
};

function resolveFirebaseProjectId(): string {
  if (cachedProjectId) return cachedProjectId;
  if (process.env.FIREBASE_PROJECT_ID) {
    cachedProjectId = process.env.FIREBASE_PROJECT_ID;
    return cachedProjectId;
  }
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { projectId?: string };
      if (parsed.projectId) {
        cachedProjectId = parsed.projectId;
        return cachedProjectId;
      }
    }
  } catch {
    // fallback handled below
  }
  cachedProjectId = 'gen-lang-client-0390447756';
  return cachedProjectId;
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
 * - When `REQUIRE_AUTH=true`, requires a valid Bearer token for every API route.
 * - Otherwise scopes unauthenticated sessions cleanly by validated `x-demo-session` token
 *   instead of relying on a hardcoded spoofable `x-user-id` header.
 */
export async function requireUserContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Missing authentication bearer token' });
      return;
    }

    try {
      const verified = await verifyFirebaseIdToken(token);
      (req as AuthenticatedRequest).auth = verified;
      next();
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unauthorized';
      res.status(401).json({ error: `Authentication failed: ${message}` });
      return;
    }
  }

  if (process.env.REQUIRE_AUTH === 'true') {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const demoSessionHeader = req.headers['x-demo-session'];
  let demoSessionId: string;

  if (typeof demoSessionHeader === 'string' && GUEST_ID_REGEX.test(demoSessionHeader.trim())) {
    demoSessionId = demoSessionHeader.trim();
  } else if (process.env.DEMO_MODE === 'shared') {
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
