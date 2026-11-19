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

export interface EnvironmentDetectionParams {
  vercelEnv?: string;
  isVercel?: boolean | string;
  viteAppEnv?: string;
  nodeEnv?: string;
  mode?: string;
  hostname?: string;
  prodFlag?: boolean;
}

export const PRODUCTION_PROJECT_ID = 'gen-lang-client-0390447756';
export const PRODUCTION_DATABASE_ID = 'ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8';

/**
 * Detects the deployment tier with strict precedence:
 * 1. Explicit test runner environments (isolated from deployment logic).
 * 2. Vercel deployment detection: VERCEL_ENV is the authoritative signal.
 *    - VERCEL_ENV=preview -> 'preview'
 *    - VERCEL_ENV=production -> 'production'
 *    - Missing or unrecognized VERCEL_ENV on Vercel -> FAIL CLOSED.
 * 3. Conflicting flags (e.g. VERCEL_ENV=preview with VITE_APP_ENV=production) -> FAIL CLOSED.
 * 4. PROD=true alone NEVER classifies a deployment as Production.
 * 5. Runtime hostname mismatches produce explicit configuration errors.
 * 6. Non-Vercel local development requires explicit configuration.
 */
export function detectDeploymentTier(envParams?: EnvironmentDetectionParams): {
  tier: DeploymentTier;
  error: Error | null;
} {
  const nodeEnv =
    envParams?.nodeEnv !== undefined
      ? envParams.nodeEnv
      : typeof process !== 'undefined' && process.env
      ? process.env.NODE_ENV
      : '';

  // 1. Explicit Test Environment (when not explicitly verifying Vercel or deployment flags)
  if (
    nodeEnv === 'test' &&
    envParams?.hostname === undefined &&
    envParams?.vercelEnv === undefined &&
    envParams?.isVercel === undefined &&
    envParams?.viteAppEnv === undefined
  ) {
    return { tier: 'test', error: null };
  }

  // 2. Gather Environment Signals
  const rawIsVercel =
    envParams?.isVercel !== undefined
      ? envParams.isVercel
      : (typeof __IS_VERCEL__ !== 'undefined' ? __IS_VERCEL__ : false) ||
        (typeof process !== 'undefined' && (process.env?.VERCEL === '1' || Boolean(process.env?.VERCEL_ENV)));

  let hostname = envParams?.hostname;
  if (!hostname && typeof window !== 'undefined' && window.location) {
    hostname = window.location.hostname || '';
  }

  const isVercelDomain = Boolean(hostname && hostname.endsWith('.vercel.app'));
  const isVercel = Boolean(
    rawIsVercel === true ||
    rawIsVercel === '1' ||
    rawIsVercel === 'true' ||
    isVercelDomain
  );

  const vercelEnv = (
    envParams?.vercelEnv !== undefined
      ? envParams.vercelEnv
      : (typeof __VERCEL_ENV__ !== 'undefined' ? __VERCEL_ENV__ : '') ||
        (typeof process !== 'undefined' ? process.env?.VERCEL_ENV : '')
  )?.trim()?.toLowerCase() || '';

  const viteAppEnv = (
    envParams?.viteAppEnv !== undefined
      ? envParams.viteAppEnv
      : (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_ENV) ||
        (typeof process !== 'undefined' ? process.env?.VITE_APP_ENV : '')
  )?.trim()?.toLowerCase() || '';

  // 3. Rule 4: Conflicting Configuration Check
  if (vercelEnv && viteAppEnv) {
    if (vercelEnv === 'preview' && viteAppEnv === 'production') {
      return {
        tier: 'preview',
        error: new Error(
          "[CONFIG_CONFLICT] Vercel environment ('preview') conflicts with VITE_APP_ENV ('production'). Preview deployment cannot be overridden to production."
        ),
      };
    }
    if (vercelEnv === 'production' && viteAppEnv === 'preview') {
      return {
        tier: 'production',
        error: new Error(
          "[CONFIG_CONFLICT] Vercel environment ('production') conflicts with VITE_APP_ENV ('preview'). Conflicting environment flags are strictly forbidden."
        ),
      };
    }
  }

  // 4. Vercel Authoritative Environment Routing (Rules 1, 2, 3, 6)
  if (isVercel) {
    // Rule 3: Missing or unrecognized Vercel environment on a Vercel deployment must fail closed!
    if (
      !vercelEnv ||
      (vercelEnv !== 'production' && vercelEnv !== 'preview' && vercelEnv !== 'development')
    ) {
      return {
        tier: 'preview',
        error: new Error(
          `[VERCEL_ENVIRONMENT_UNRECOGNIZED] Running on Vercel deployment but VERCEL_ENV is missing or unrecognized ('${vercelEnv}'). Cannot safely determine deployment tier.`
        ),
      };
    }

    // Rule 1: VERCEL_ENV=preview must resolve to Preview/Staging even when Vite PROD=true
    if (vercelEnv === 'preview') {
      // Rule 6: Check hostname mismatch if running in browser
      if (hostname && hostname === 'focus-flow-by-atif.vercel.app') {
        return {
          tier: 'preview',
          error: new Error(
            "[HOSTNAME_TIER_MISMATCH] Production domain 'focus-flow-by-atif.vercel.app' detected but VERCEL_ENV is 'preview'. Aborting to prevent configuration confusion."
          ),
        };
      }
      return { tier: 'preview', error: null };
    }

    // Rule 2: VERCEL_ENV=production must resolve to Production
    if (vercelEnv === 'production') {
      // Rule 6: Check hostname mismatch if running in browser on a preview subdomain
      if (
        hostname &&
        hostname.endsWith('.vercel.app') &&
        hostname !== 'focus-flow-by-atif.vercel.app'
      ) {
        return {
          tier: 'production',
          error: new Error(
            `[HOSTNAME_TIER_MISMATCH] Preview subdomain '${hostname}' detected but VERCEL_ENV is 'production'. Aborting to prevent production data access from preview URLs.`
          ),
        };
      }
      return { tier: 'production', error: null };
    }

    if (vercelEnv === 'development') {
      return { tier: 'development', error: null };
    }
  }

  // 5. Non-Vercel Deployments (Local or custom host)
  if (viteAppEnv === 'preview') {
    return { tier: 'preview', error: null };
  }
  if (viteAppEnv === 'production') {
    return { tier: 'production', error: null };
  }

  if (hostname) {
    if (hostname.endsWith('.vercel.app') && hostname !== 'focus-flow-by-atif.vercel.app') {
      return { tier: 'preview', error: null };
    }
    if (hostname === 'focus-flow-by-atif.vercel.app') {
      return { tier: 'production', error: null };
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
      return { tier: 'development', error: null };
    }
  }

  const mode = (
    envParams?.mode ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE)
  )?.trim()?.toLowerCase();
  if (mode === 'preview') {
    return { tier: 'preview', error: null };
  }

  // Rule 5: PROD=true must NEVER independently classify a deployment as Production!
  // Neither import.meta.env.PROD nor NODE_ENV=production can assume Production without explicit configuration.

  // 6. Default Fallback (Local Development)
  return { tier: 'development', error: null };
}

/**
 * Resolves Firebase configuration with strict environment isolation:
 * - Production: uses explicit production env vars or defaults safely to committed manifest.
 * - Preview: strictly requires explicit Staging Firebase configuration and fails closed if missing or pointing to production.
 * - Development: requires explicit local configuration or fails closed to prevent silent production fallback.
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

  const tierResult = tierOverride
    ? { tier: tierOverride, error: null }
    : detectDeploymentTier({
        vercelEnv: getEnv('VERCEL_ENV'),
        isVercel: getEnv('VERCEL') || getEnv('IS_VERCEL'),
        viteAppEnv: getEnv('VITE_APP_ENV'),
        nodeEnv: getEnv('NODE_ENV'),
        mode: getEnv('MODE'),
        hostname: envOverrides?.hostname,
      });

  if (tierResult.error) {
    return {
      config: null,
      error: tierResult.error,
      tier: tierResult.tier,
    };
  }

  const tier = tierResult.tier;

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
  const devProjectId = getEnv('VITE_FIREBASE_PROJECT_ID') || getEnv('FIREBASE_PROJECT_ID');
  const devDatabaseId = getEnv('VITE_FIREBASE_DATABASE_ID');

  // Rule 7: Local development with explicit settings is supported cleanly
  if (devProjectId) {
    return {
      config: {
        apiKey: getEnv('VITE_FIREBASE_API_KEY') || '',
        authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || `${devProjectId}.firebaseapp.com`,
        projectId: devProjectId,
        storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || `${devProjectId}.firebasestorage.app`,
        messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || '',
        appId: getEnv('VITE_FIREBASE_APP_ID') || '',
        firestoreDatabaseId: devDatabaseId || 'default',
        tier: 'development',
        isStagingIsolated: devProjectId !== PRODUCTION_PROJECT_ID,
      },
      error: null,
      tier: 'development',
    };
  }

  // Rule 7: If no explicit local settings, fail closed to prevent silent production fallback
  return {
    config: null,
    error: new Error(
      '[LOCAL_CONFIG_REQUIRED] Local development requires an explicitly configured Firebase project (e.g. VITE_FIREBASE_PROJECT_ID in .env.local). Silent fallback to Production Firebase is blocked.'
    ),
    tier: 'development',
  };
}
