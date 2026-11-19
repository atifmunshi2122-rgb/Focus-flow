import firebaseManifest from '../../firebase-applet-config.json';

export type DeploymentTier = 'production' | 'preview' | 'development' | 'test';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
  tier: DeploymentTier;
  isStagingIsolated: boolean;
}

export interface ConfigurationResolutionResult {
  config: FirebaseClientConfig | null;
  error: Error | null;
  tier: DeploymentTier;
}

export const PRODUCTION_PROJECT_ID = 'gen-lang-client-0390447756';
export const PRODUCTION_DATABASE_ID = 'ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8';

/**
 * Detects the deployment tier based on environment flags, global define tokens,
 * or runtime hostname verification.
 */
export function detectDeploymentTier(envParams?: {
  vercelEnv?: string;
  viteAppEnv?: string;
  nodeEnv?: string;
  mode?: string;
  hostname?: string;
}): DeploymentTier {
  // 1. Explicit Test Environment (only when hostname is not specifically tested)
  const nodeEnv =
    envParams?.nodeEnv !== undefined
      ? envParams.nodeEnv
      : typeof process !== 'undefined' && process.env
      ? process.env.NODE_ENV
      : '';
  if (nodeEnv === 'test' && !envParams?.hostname) {
    return 'test';
  }

  // 2. Explicit Preview Environment Flags
  const vercelEnv =
    envParams?.vercelEnv ||
    (typeof __VERCEL_ENV__ !== 'undefined' ? __VERCEL_ENV__ : '') ||
    (typeof process !== 'undefined' && process.env ? process.env.VERCEL_ENV : '');

  const viteAppEnv =
    envParams?.viteAppEnv ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env.VITE_APP_ENV
      : '');

  const mode =
    envParams?.mode ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env.MODE
      : '');

  if (vercelEnv === 'preview' || viteAppEnv === 'preview' || mode === 'preview') {
    return 'preview';
  }

  // 3. Runtime Browser Hostname Inspection
  let hostname = envParams?.hostname;
  if (!hostname && typeof window !== 'undefined' && window.location) {
    hostname = window.location.hostname || '';
  }

  if (hostname) {
    // Production domain
    if (hostname === 'focus-flow-by-atif.vercel.app') {
      return 'production';
    }
    // Standard Vercel Preview subdomains (e.g. *-git-*.vercel.app or *-hash.vercel.app)
    if (
      hostname.endsWith('.vercel.app') &&
      hostname !== 'focus-flow-by-atif.vercel.app'
    ) {
      return 'preview';
    }
    // Local development addresses
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.local')
    ) {
      return 'development';
    }
  }

  // 4. Production Flags
  if (
    vercelEnv === 'production' ||
    viteAppEnv === 'production' ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD) ||
    nodeEnv === 'production'
  ) {
    return 'production';
  }

  // 5. Default Fallback
  return 'development';
}

/**
 * Resolves Firebase configuration with strict environment isolation:
 * - Production: uses explicit production env vars or defaults safely to committed manifest.
 * - Preview: strictly requires explicit Staging Firebase configuration and fails closed if missing or pointing to production.
 * - Development: uses local overrides or dev manifest.
 * - Test: provides test configuration.
 */
export function resolveFirebaseConfiguration(
  envOverrides?: Record<string, string | undefined>,
  tierOverride?: DeploymentTier
): ConfigurationResolutionResult {
  const metaEnv: Record<string, string | undefined> =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env
      : {};

  const processEnv: Record<string, string | undefined> =
    typeof process !== 'undefined' && process.env ? (process.env as any) : {};

  const getEnv = (key: string): string | undefined => {
    if (envOverrides && key in envOverrides) {
      return envOverrides[key];
    }
    return metaEnv[key] || processEnv[key];
  };

  const tier =
    tierOverride ||
    detectDeploymentTier({
      vercelEnv: getEnv('VERCEL_ENV'),
      viteAppEnv: getEnv('VITE_APP_ENV'),
      nodeEnv: getEnv('NODE_ENV'),
      mode: getEnv('MODE'),
    });

  // ==========================================
  // PREVIEW ENVIRONMENT (STAGING ISOLATION GATE)
  // ==========================================
  if (tier === 'preview') {
    const projectId = getEnv('VITE_FIREBASE_PROJECT_ID') || getEnv('FIREBASE_PROJECT_ID');
    const apiKey = getEnv('VITE_FIREBASE_API_KEY');
    const authDomain = getEnv('VITE_FIREBASE_AUTH_DOMAIN');
    const databaseId = getEnv('VITE_FIREBASE_DATABASE_ID');
    const storageBucket = getEnv('VITE_FIREBASE_STORAGE_BUCKET');
    const messagingSenderId = getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID');
    const appId = getEnv('VITE_FIREBASE_APP_ID');

    const missingFields: string[] = [];
    if (!projectId) missingFields.push('VITE_FIREBASE_PROJECT_ID');
    if (!apiKey) missingFields.push('VITE_FIREBASE_API_KEY');
    if (!authDomain) missingFields.push('VITE_FIREBASE_AUTH_DOMAIN');
    if (!databaseId) missingFields.push('VITE_FIREBASE_DATABASE_ID');

    if (missingFields.length > 0) {
      return {
        config: null,
        error: new Error(
          `[PREVIEW_STAGING_CONFIG_MISSING] Vercel Preview requires explicit Staging Firebase configuration (${missingFields.join(
            ', '
          )}). Automatic fallback to Production Firebase is blocked to prevent data contamination.`
        ),
        tier: 'preview',
      };
    }

    // Safety Gate: Ensure Preview does NOT point to the Production project or database
    if (projectId === PRODUCTION_PROJECT_ID) {
      return {
        config: null,
        error: new Error(
          `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use the Production Firebase Project (${PRODUCTION_PROJECT_ID}). Preview must use a dedicated Staging Firebase Project.`
        ),
        tier: 'preview',
      };
    }

    if (databaseId === PRODUCTION_DATABASE_ID) {
      return {
        config: null,
        error: new Error(
          `[STAGING_DATA_SAFETY_VIOLATION] Preview deployment cannot use the Production Firestore Database (${PRODUCTION_DATABASE_ID}). Preview must use a dedicated Staging Firestore Database.`
        ),
        tier: 'preview',
      };
    }

    return {
      config: {
        apiKey: apiKey!,
        authDomain: authDomain!,
        projectId: projectId!,
        storageBucket: storageBucket || `${projectId}.firebasestorage.app`,
        messagingSenderId: messagingSenderId || '',
        appId: appId || '',
        firestoreDatabaseId: databaseId!,
        tier: 'preview',
        isStagingIsolated: true,
      },
      error: null,
      tier: 'preview',
    };
  }

  // ==========================================
  // PRODUCTION ENVIRONMENT
  // ==========================================
  if (tier === 'production') {
    const projectId =
      getEnv('VITE_FIREBASE_PROJECT_ID') ||
      getEnv('FIREBASE_PROJECT_ID') ||
      firebaseManifest.projectId ||
      PRODUCTION_PROJECT_ID;

    const apiKey = getEnv('VITE_FIREBASE_API_KEY') || firebaseManifest.apiKey;
    const authDomain = getEnv('VITE_FIREBASE_AUTH_DOMAIN') || firebaseManifest.authDomain;
    const storageBucket =
      getEnv('VITE_FIREBASE_STORAGE_BUCKET') || firebaseManifest.storageBucket;
    const messagingSenderId =
      getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || firebaseManifest.messagingSenderId;
    const appId = getEnv('VITE_FIREBASE_APP_ID') || firebaseManifest.appId;
    const databaseId =
      getEnv('VITE_FIREBASE_DATABASE_ID') ||
      firebaseManifest.firestoreDatabaseId ||
      PRODUCTION_DATABASE_ID;

    return {
      config: {
        apiKey: apiKey || '',
        authDomain: authDomain || '',
        projectId,
        storageBucket: storageBucket || '',
        messagingSenderId: messagingSenderId || '',
        appId: appId || '',
        firestoreDatabaseId: databaseId,
        tier: 'production',
        isStagingIsolated: false,
      },
      error: null,
      tier: 'production',
    };
  }

  // ==========================================
  // TEST ENVIRONMENT
  // ==========================================
  if (tier === 'test') {
    const projectId =
      getEnv('VITE_FIREBASE_PROJECT_ID') ||
      getEnv('FIREBASE_PROJECT_ID') ||
      firebaseManifest.projectId ||
      'test-rules-project';

    const databaseId =
      getEnv('VITE_FIREBASE_DATABASE_ID') ||
      firebaseManifest.firestoreDatabaseId ||
      PRODUCTION_DATABASE_ID;

    return {
      config: {
        apiKey: getEnv('VITE_FIREBASE_API_KEY') || firebaseManifest.apiKey,
        authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || firebaseManifest.authDomain,
        projectId,
        storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || firebaseManifest.storageBucket,
        messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || firebaseManifest.messagingSenderId,
        appId: getEnv('VITE_FIREBASE_APP_ID') || firebaseManifest.appId,
        firestoreDatabaseId: databaseId,
        tier: 'test',
        isStagingIsolated: true,
      },
      error: null,
      tier: 'test',
    };
  }

  // ==========================================
  // DEVELOPMENT ENVIRONMENT
  // ==========================================
  const devProjectId =
    getEnv('VITE_FIREBASE_PROJECT_ID') ||
    getEnv('FIREBASE_PROJECT_ID') ||
    firebaseManifest.projectId ||
    PRODUCTION_PROJECT_ID;

  const devApiKey = getEnv('VITE_FIREBASE_API_KEY') || firebaseManifest.apiKey;
  const devAuthDomain = getEnv('VITE_FIREBASE_AUTH_DOMAIN') || firebaseManifest.authDomain;
  const devStorageBucket =
    getEnv('VITE_FIREBASE_STORAGE_BUCKET') || firebaseManifest.storageBucket;
  const devMessagingSenderId =
    getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || firebaseManifest.messagingSenderId;
  const devAppId = getEnv('VITE_FIREBASE_APP_ID') || firebaseManifest.appId;
  const devDatabaseId =
    getEnv('VITE_FIREBASE_DATABASE_ID') ||
    firebaseManifest.firestoreDatabaseId ||
    PRODUCTION_DATABASE_ID;

  return {
    config: {
      apiKey: devApiKey || '',
      authDomain: devAuthDomain || '',
      projectId: devProjectId,
      storageBucket: devStorageBucket || '',
      messagingSenderId: devMessagingSenderId || '',
      appId: devAppId || '',
      firestoreDatabaseId: devDatabaseId,
      tier: 'development',
      isStagingIsolated: devProjectId !== PRODUCTION_PROJECT_ID,
    },
    error: null,
    tier: 'development',
  };
}
