import {
  getGoogleOAuthClientId,
  loadGoogleIdentityServicesScript,
} from './googleAuthGis.ts';

export type MeetCallMode = 'audio' | 'video';

export interface MeetSpaceResult {
  meetingUri: string;
  meetingCode: string | null;
  mode: MeetCallMode;
  createdViaApi: boolean;
}

const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';
const MEET_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MEET_CONSENT_KEY_PREFIX = 'ff_meet_consent_granted_';

let cachedMeetAccessToken: string | null = null;
let cachedMeetTokenExpiresAt = 0;
let cachedMeetLoginHint: string | null = null;

function normalizeAccountKey(loginHint?: string): string {
  return loginHint?.trim().toLowerCase() || 'default';
}

function getMeetConsentStorageKey(loginHint?: string): string {
  return `${MEET_CONSENT_KEY_PREFIX}${encodeURIComponent(normalizeAccountKey(loginHint))}`;
}

function hasGrantedMeetConsent(loginHint?: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(getMeetConsentStorageKey(loginHint)) === '1';
  } catch {
    return false;
  }
}

function setMeetConsentGranted(granted: boolean, loginHint?: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = getMeetConsentStorageKey(loginHint);
    if (granted) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
}

function getMeetApiKey(): string {
  try {
    const envKey =
      import.meta.env?.VITE_GOOGLE_MEET_API_KEY ||
      import.meta.env?.VITE_GOOGLE_API_KEY;
    if (typeof envKey === 'string' && envKey.trim()) {
      return envKey.trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Non-Vite runtime
  }
  try {
    const procKey =
      process.env?.VITE_GOOGLE_MEET_API_KEY ||
      process.env?.VITE_GOOGLE_API_KEY;
    if (typeof procKey === 'string' && procKey.trim()) {
      return procKey.trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Ignore
  }
  return '';
}

async function requestMeetAccessToken(loginHint?: string): Promise<string | null> {
  const accountKey = normalizeAccountKey(loginHint);
  if (
    cachedMeetAccessToken &&
    cachedMeetLoginHint === accountKey &&
    Date.now() < cachedMeetTokenExpiresAt - 30_000
  ) {
    return cachedMeetAccessToken;
  }
  if (cachedMeetLoginHint !== accountKey) {
    cachedMeetAccessToken = null;
    cachedMeetTokenExpiresAt = 0;
    cachedMeetLoginHint = accountKey;
  }
  if (typeof window === 'undefined') return null;
  try {
    await loadGoogleIdentityServicesScript();
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return null;

    const priorConsent = hasGrantedMeetConsent(loginHint);
    return await new Promise<string | null>((resolve) => {
      const client = oauth2.initTokenClient({
        client_id: getGoogleOAuthClientId(),
        scope: MEET_SCOPE,
        login_hint: loginHint,
        callback: (res) => {
          if (res?.access_token) {
            cachedMeetAccessToken = res.access_token;
            cachedMeetLoginHint = accountKey;
            cachedMeetTokenExpiresAt =
              Date.now() + Math.max(60, Number(res.expires_in) || 3500) * 1000;
            setMeetConsentGranted(true, loginHint);
            resolve(res.access_token);
          } else {
            setMeetConsentGranted(false, loginHint);
            resolve(null);
          }
        },
        error_callback: () => {
          setMeetConsentGranted(false, loginHint);
          resolve(null);
        },
      });
      client.requestAccessToken({ prompt: priorConsent ? '' : 'consent' });
    });
  } catch {
    return null;
  }
}

function roomCacheKey(roomKey: string, loginHint?: string): string {
  const accountPart = loginHint?.trim() ? `${encodeURIComponent(normalizeAccountKey(loginHint))}_` : '';
  return `focusflow_meet_room_${accountPart}${roomKey}`;
}

export function getCachedRoomMeetLink(roomKey: string, loginHint?: string): MeetSpaceResult | null {
  try {
    const raw = localStorage.getItem(roomCacheKey(roomKey, loginHint));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MeetSpaceResult & { savedAt: number };
    if (!parsed?.meetingUri || Date.now() - (parsed.savedAt || 0) > MEET_CACHE_TTL_MS) {
      return null;
    }
    return {
      meetingUri: parsed.meetingUri,
      meetingCode: parsed.meetingCode ?? null,
      mode: parsed.mode === 'audio' ? 'audio' : 'video',
      createdViaApi: Boolean(parsed.createdViaApi),
    };
  } catch {
    return null;
  }
}

export function saveCachedRoomMeetLink(roomKey: string, data: MeetSpaceResult, loginHint?: string): void {
  try {
    localStorage.setItem(
      roomCacheKey(roomKey, loginHint),
      JSON.stringify({ ...data, savedAt: Date.now() })
    );
  } catch {
    // ignore storage errors
  }
}

/**
 * Starts or joins a Google Meet voice/video call for a Study Squad or Room.
 * Attempts Google Meet REST API v2 (spaces.create) when OAuth is granted,
 * and falls back cleanly to Google Meet instant room (`meet.google.com/new`) otherwise.
 */
export async function startOrJoinGoogleMeetCall(params: {
  roomKey: string;
  mode: MeetCallMode;
  loginHint?: string;
}): Promise<MeetSpaceResult> {
  const cached = getCachedRoomMeetLink(params.roomKey, params.loginHint);
  if (cached && cached.createdViaApi) {
    return { ...cached, mode: params.mode };
  }

  const token = await requestMeetAccessToken(params.loginHint);
  if (token) {
    try {
      const apiKey = getMeetApiKey();
      const url = apiKey
        ? `https://meet.googleapis.com/v2/spaces?key=${encodeURIComponent(apiKey)}`
        : 'https://meet.googleapis.com/v2/spaces';
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: { accessType: 'OPEN' },
        }),
      });
      if (resp.ok) {
        const json = (await resp.json()) as {
          meetingUri?: string;
          meetingCode?: string;
        };
        if (json.meetingUri) {
          const result: MeetSpaceResult = {
            meetingUri: json.meetingUri,
            meetingCode: json.meetingCode || null,
            mode: params.mode,
            createdViaApi: true,
          };
          saveCachedRoomMeetLink(params.roomKey, result, params.loginHint);
          return result;
        }
      }
    } catch {
      // Fall back to instant Meet link below
    }
  }

  return {
    meetingUri: 'https://meet.google.com/new',
    meetingCode: null,
    mode: params.mode,
    createdViaApi: false,
  };
}

