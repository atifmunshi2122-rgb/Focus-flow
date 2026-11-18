/**
 * Universal Sheet Sync Hub — Google Sheets URL Parser & Validator
 * Pure utility supporting standard, /edit, /view, /u/N/, query-param, and gid-bearing URLs.
 */

export type SheetUrlErrorCode =
  | 'EMPTY_URL'
  | 'INVALID_URL_FORMAT'
  | 'UNSUPPORTED_PROTOCOL'
  | 'UNSUPPORTED_HOST'
  | 'PUBLISHED_WEB_LINK_UNSUPPORTED'
  | 'MISSING_SPREADSHEET_ID'
  | 'INVALID_SPREADSHEET_ID';

export type ParsedGoogleSheetUrl =
  | {
      ok: true;
      spreadsheetId: string;
      gid: number | null;
      canonicalUrl: string;
    }
  | {
      ok: false;
      code: SheetUrlErrorCode;
      error: string;
    };

const VALID_SPREADSHEET_ID_REGEX = /^[a-zA-Z0-9_-]{15,128}$/;
const ALLOWED_HOSTS = new Set(['docs.google.com', 'sheets.google.com']);

/**
 * Extracts a numeric `gid` from query params or hash fragment if present.
 * Returns null if absent or non-numeric.
 */
function extractGid(url: URL): number | null {
  const fromQuery = url.searchParams.get('gid');
  if (fromQuery !== null && /^\d+$/.test(fromQuery.trim())) {
    return Number(fromQuery.trim());
  }
  const hash = (url.hash || '').replace(/^#/, '');
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    const fromHash = hashParams.get('gid');
    if (fromHash !== null && /^\d+$/.test(fromHash.trim())) {
      return Number(fromHash.trim());
    }
    const directMatch = hash.match(/(?:^|&)gid=(\d+)(?:&|$)/);
    if (directMatch) {
      return Number(directMatch[1]);
    }
  }
  return null;
}

/**
 * Validates and parses a Google Sheets URL into a canonical spreadsheetId and optional gid.
 */
export function parseGoogleSheetUrl(rawInput: string): ParsedGoogleSheetUrl {
  const trimmed = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!trimmed) {
    return {
      ok: false,
      code: 'EMPTY_URL',
      error: 'Please paste a Google Sheets URL.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      code: 'INVALID_URL_FORMAT',
      error: 'Invalid URL format. Expected a link like https://docs.google.com/spreadsheets/d/<spreadsheet-id>/edit',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      code: 'UNSUPPORTED_PROTOCOL',
      error: 'Only http(s) Google Sheets URLs are supported.',
    };
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      ok: false,
      code: 'UNSUPPORTED_HOST',
      error: `Unsupported host "${parsed.hostname}". Please paste a docs.google.com Google Sheets URL.`,
    };
  }

  // Reject published-to-web /spreadsheets/d/e/2PACX-... links cleanly with guidance
  if (/^\/spreadsheets(?:\/u\/\d+)?\/d\/e\//i.test(parsed.pathname)) {
    return {
      ok: false,
      code: 'PUBLISHED_WEB_LINK_UNSUPPORTED',
      error:
        'Published-to-web (/d/e/2PACX-...) links cannot be accessed through the Google Sheets API. Please paste the standard spreadsheet URL (/spreadsheets/d/<id>/edit).',
    };
  }

  // Match /spreadsheets/d/<id>(/...) or /spreadsheets/u/<n>/d/<id>(/...)
  const match = parsed.pathname.match(
    /^\/spreadsheets(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/i
  );

  if (!match || !match[1]) {
    return {
      ok: false,
      code: 'MISSING_SPREADSHEET_ID',
      error: 'Could not find a Google Spreadsheet ID in this URL. Expected /spreadsheets/d/<id>.',
    };
  }

  const spreadsheetId = decodeURIComponent(match[1]).trim();
  if (!VALID_SPREADSHEET_ID_REGEX.test(spreadsheetId)) {
    return {
      ok: false,
      code: 'INVALID_SPREADSHEET_ID',
      error: 'The spreadsheet ID in this URL is malformed or too short.',
    };
  }

  const gid = extractGid(parsed);
  const canonicalUrl =
    gid !== null
      ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`
      : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return {
    ok: true,
    spreadsheetId,
    gid,
    canonicalUrl,
  };
}

/**
 * Validates a raw Google Spreadsheet ID string.
 */
export function isValidGoogleSpreadsheetId(id: string): boolean {
  return typeof id === 'string' && VALID_SPREADSHEET_ID_REGEX.test(id.trim());
}

