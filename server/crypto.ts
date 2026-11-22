import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Resolves the 32-byte AES-256 key from INTEGRATION_ENCRYPTION_KEY.
 * If not set or non-standard length, derives a deterministic 32-byte key using SHA-256.
 */
export function resolveEncryptionKey(): Buffer {
  const envKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (envKey && envKey.length > 0) {
    // If provided as a 64-character hex string
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    // Otherwise derive 32-byte key via SHA-256
    return crypto.createHash('sha256').update(envKey, 'utf8').digest();
  }

  // Development/Test fallback key
  const fallbackSeed = process.env.NODE_ENV === 'production'
    ? 'production-fallback-must-override-via-INTEGRATION_ENCRYPTION_KEY'
    : 'focusflow-development-integration-encryption-key-seed';
  return crypto.createHash('sha256').update(fallbackSeed, 'utf8').digest();
}

export interface EncryptedPayload {
  encrypted: string; // Hex-encoded ciphertext
  iv: string;        // Hex-encoded IV
  tag: string;       // Hex-encoded GCM authentication tag
}

/**
 * Encrypts a plaintext string (e.g. OAuth access or refresh token) using AES-256-GCM.
 */
export function encryptToken(plainText: string, customKey?: Buffer): EncryptedPayload {
  if (!plainText) {
    throw new Error('Cannot encrypt empty or null token');
  }

  const key = customKey || resolveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload and verifies message integrity.
 * Throws an error if the authentication tag fails (tampering detected).
 */
export function decryptToken(payload: EncryptedPayload, customKey?: Buffer): string {
  if (!payload || !payload.encrypted || !payload.iv || !payload.tag) {
    throw new Error('Invalid encrypted payload: encrypted, iv, and tag are required');
  }

  const key = customKey || resolveEncryptionKey();
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

