export type AuthScopeMode = 'basic' | 'sheets';

export interface AuthDiagnostic {
  code: string;
  title: string;
  summary: string;
  resolutionHint: string;
  isIframe: boolean;
  hostname: string;
  scopeMode: AuthScopeMode;
  shouldOfferNewTab: boolean;
  shouldOfferCopyDomain: boolean;
  canRetry: boolean;
  rawMessage: string;
}

export function detectEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin frame access throws a SecurityError, confirming embedded frame execution
    return true;
  }
}

export function getCurrentHostname(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.hostname || '';
}

export function getCurrentAppUrl(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.href || '';
}

export function extractFirebaseAuthCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim().length > 0) {
      return code.trim();
    }
  }

  const msg = error instanceof Error ? error.message : String(error ?? '');
  const match = msg.match(/\b(auth\/[a-z0-9-]+)\b/i);
  if (match) {
    return match[1].toLowerCase();
  }
  if (/access_denied/i.test(msg)) {
    return 'auth/access-denied';
  }
  if (/missing_access_token/i.test(msg)) {
    return 'auth/missing-access-token';
  }
  return 'auth/unknown';
}

export function classifyFirebaseAuthError(
  error: unknown,
  options: {
    scopeMode: AuthScopeMode;
    isIframe?: boolean;
    hostname?: string;
    userEmail?: string | null;
  }
): AuthDiagnostic {
  const code = extractFirebaseAuthCode(error);
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown authentication error');
  const isIframe = options.isIframe ?? detectEmbeddedIframe();
  const hostname = options.hostname ?? getCurrentHostname();
  const isSheets = options.scopeMode === 'sheets';

  if (code === 'auth/popup-blocked') {
    return {
      code,
      title: 'Browser Blocked the Google Sign-In Popup',
      summary: isIframe
        ? 'Your browser or embedded preview frame prevented the Google Sign-In popup window from opening.'
        : 'Your browser blocked the Google Sign-In popup window before Google could load.',
      resolutionHint: isIframe
        ? 'Click "Open App in New Tab" below to sign in outside the embedded frame, or allow popups for this site and retry.'
        : 'Allow popups for this site in your browser address bar, or use "Open App in New Tab" and click Retry.',
      isIframe,
      hostname,
      scopeMode: options.scopeMode,
      shouldOfferNewTab: true,
      shouldOfferCopyDomain: false,
      canRetry: true,
      rawMessage,
    };
  }

  if (code === 'auth/popup-closed-by-user') {
    return {
      code,
      title: isIframe
        ? 'Sign-In Popup Closed Inside Embedded Preview'
        : isSheets
        ? 'Google Sheets Authorization Window Closed'
        : 'Google Sign-In Window Was Closed',
      summary: isIframe
        ? 'The Google Sign-In popup closed immediately before authentication finished. Embedded preview iframes frequently terminate cross-origin Google auth popups.'
        : 'The Google sign-in window closed before Google returned your credentials.',
      resolutionHint: isIframe
        ? 'Use "Open App in New Tab" below so Google Sign-In can open in a top-level browser tab, then retry.'
        : 'Click Retry and finish selecting your Google account without closing the popup.',
      isIframe,
      hostname,
      scopeMode: options.scopeMode,
      shouldOfferNewTab: true,
      shouldOfferCopyDomain: false,
      canRetry: true,
      rawMessage,
    };
  }

  if (code === 'auth/cancelled-popup-request') {
    return {
      code,
      title: 'Previous Sign-In Popup Was Superseded',
      summary: 'A conflicting sign-in popup request cancelled the active window.',
      resolutionHint: 'Close any stray Google login popups and click Retry once.',
      isIframe,
      hostname,
      scopeMode: options.scopeMode,
      shouldOfferNewTab: isIframe,
      shouldOfferCopyDomain: false,
      canRetry: true,
      rawMessage,
    };
  }

  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      title: 'Domain Not Authorized for Firebase Sign-In',
      summary: `Firebase Authentication rejected sign-in because "${hostname || 'this host'}" is not in the project's Authorized Domains list.`,
      resolutionHint:
        'Copy this hostname and add it under Firebase Console → Authentication → Settings → Authorized domains, then click Retry.',
      isIframe,
      hostname,
      scopeMode: options.scopeMode,
      shouldOfferNewTab: false,
      shouldOfferCopyDomain: Boolean(hostname),
      canRetry: true,
      rawMessage,
    };
  }

  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      title: 'Google Sign-In Provider Is Disabled',
      summary: 'The Google sign-in provider is not enabled in this Firebase project.',
      resolutionHint: 'Enable Google in Firebase Console → Authentication → Sign-in method and retry.',
      isIframe,
      hostname,
      scopeMode: options.scopeMode,
      shouldOfferNewTab: false,
      shouldOfferCopyDomain: false,
      canRetry: true,
      rawMessage,
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      code,
      title: 'Network Error Reaching Google Auth',
      summary: 'A network interruption or strict privacy/cookie blocker prevented reaching Google authentication servers.',
      resolutionHint:
        'Check your connection, ensure third-party cookies / firebaseapp.com popups are not blocked, or open the app in a new tab.',
      isIframe,
      hostname,
      scopeMode: options.scopeMode,
      shouldOfferNewTab: isIframe,
      shouldOfferCopyDomain: false,
      canRetry: true,
      rawMessage,
    };
  }

  if (code === 'auth/user-mismatch') {
    return {
      code,
      title: 'Different Google Account Selected',
      summary: options.userEmail
        ? `Please authorize Google Sheets using the same signed-in account (${options.userEmail}).`
        : 'The Google account chosen in the popup does not match your active session.',
      resolutionHint: 'Click Retry and select the same Google account you are currently signed in with.',
      isIframe,
      hostname,
      scopeMode: options.scopeMode,
      shouldOfferNewTab: false,
      shouldOfferCopyDomain: false,
      canRetry: true,
      rawMessage,
    };
  }

  if (code === 'auth/access-denied' || code === 'auth/missing-access-token') {
    return {
      code,
      title: isSheets ? 'Google Sheets Permissions Required' : 'Google Sign-In Consent Declined',
      summary: isSheets
        ? 'Google Sheets & Drive access was not granted, so spreadsheet sync could not proceed. Your basic Firebase account sign-in remains active.'
        : 'Google sign-in permissions were not granted.',
      resolutionHint: isSheets
        ? 'Click Retry and approve Google Sheets and Drive file permissions when prompted.'
        : 'Click Retry and approve sign-in to continue.',
      isIframe,
      hostname,
      scopeMode: options.scopeMode,
      shouldOfferNewTab: isIframe,
      shouldOfferCopyDomain: false,
      canRetry: true,
      rawMessage,
    };
  }

  return {
    code,
    title: isSheets ? 'Google Sheets Authorization Failed' : 'Google Sign-In Failed',
    summary: `Authentication returned "${code}": ${rawMessage}`,
    resolutionHint: isIframe
      ? 'If the popup closed right away, open the app in a dedicated browser tab using Open App in New Tab below.'
      : 'Review the error details above and click Retry.',
    isIframe,
    hostname,
    scopeMode: options.scopeMode,
    shouldOfferNewTab: true,
    shouldOfferCopyDomain: false,
    canRetry: true,
    rawMessage,
  };
}

/**
 * Deduplicates concurrent popup requests so overlapping clicks reuse the active popup promise
 * instead of triggering Firebase's `auth/cancelled-popup-request`.
 */
export function createSingleFlightRunner<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  let activePromise: Promise<TResult> | null = null;

  return (...args: TArgs): Promise<TResult> => {
    if (activePromise) {
      return activePromise;
    }
    const runPromise = fn(...args).finally(() => {
      if (activePromise === runPromise) {
        activePromise = null;
      }
    });
    activePromise = runPromise;
    return runPromise;
  };
}
