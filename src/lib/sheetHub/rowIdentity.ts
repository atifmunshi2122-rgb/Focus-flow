/**
 * Universal Sheet Sync Hub — Row Identity & Byte-Safe Chunking Foundation
 *
 * Rules:
 * - Physical row numbers are NEVER permanent identifiers.
 * - Supports: (1) existing unique ID column, (2) user-confirmed composite keys, (3) optional opt-in metadata ID column.
 * - Never mutates source sheets or silently adds hidden columns.
 * - Enforces both row count targets (~150 rows/chunk) AND strict UTF-8 byte ceilings well below Firestore's 1 MiB doc limit.
 */

import type {
  SheetCellScalar,
  SheetChunkPackResult,
  SheetColumnMapping,
  SheetIdentityAuditResult,
  SheetIdentityDuplicateEntry,
  SheetIdentityStrategy,
  SheetRowChunk,
  SheetSyncedRow,
} from '../../types/sheetHub.ts';

export const DEFAULT_CHUNK_MAX_ROWS = 150;
// Conservative 700 KB UTF-8 ceiling (Firestore hard limit is 1,048,576 bytes / 1 MiB)
export const DEFAULT_CHUNK_MAX_BYTES = 700_000;
// Envelope overhead allowance for chunk metadata keys, Firestore field encoding overhead, etc.
const CHUNK_ENVELOPE_OVERHEAD_BYTES = 1024;

const textEncoder = new TextEncoder();

export function utf8ByteLength(str: string): number {
  return textEncoder.encode(str).byteLength;
}

/**
 * Deterministic, synchronous FNV-1a 64-bit hex digest (browser & Node compatible without async SubtleCrypto).
 * Produces compact, collision-resistant 16-hex-char identifiers safe for Firestore map keys and IDs.
 */
export function deterministicHashHex(input: string): string {
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x84222325cbf29ce4n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let i = 0; i < input.length; i++) {
    const code = BigInt(input.charCodeAt(i));
    h1 = ((h1 ^ code) * prime) & mask;
    h2 = ((h2 ^ (code + BigInt(i + 1))) * prime) & mask;
  }

  return `${h1.toString(16).padStart(16, '0')}${h2.toString(16).padStart(16, '0')}`;
}

function normalizeKeyPart(val: SheetCellScalar | undefined): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '';
  return val.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface RowInputForIdentity {
  sheetRowNumber: number; // 1-based physical row index (metadata only)
  values: Record<string, SheetCellScalar>;
}

export interface UniqueColumnCandidate {
  fieldKey: string;
  headerName: string;
  uniqueRatio: number;
  missingCount: number;
  duplicateCount: number;
  isStrictlyUnique: boolean;
}

/**
 * Inspects all columns in a tab to identify existing 100%-unique non-empty ID columns.
 */
export function detectUniqueIdColumns(
  columns: SheetColumnMapping[],
  rows: RowInputForIdentity[]
): UniqueColumnCandidate[] {
  const results: UniqueColumnCandidate[] = [];
  const total = rows.length;

  for (const col of columns) {
    if (col.inferredType === 'boolean' || col.inferredType === 'checkbox' || col.inferredType === 'formula') {
      continue;
    }

    const seen = new Set<string>();
    let missingCount = 0;
    let duplicateCount = 0;

    for (const row of rows) {
      const norm = normalizeKeyPart(row.values[col.fieldKey]);
      if (!norm) {
        missingCount++;
      } else if (seen.has(norm)) {
        duplicateCount++;
      } else {
        seen.add(norm);
      }
    }

    const nonMissing = total - missingCount;
    const uniqueRatio = nonMissing > 0 ? seen.size / nonMissing : 0;
    const isStrictlyUnique = total > 0 && missingCount === 0 && duplicateCount === 0;

    results.push({
      fieldKey: col.fieldKey,
      headerName: col.headerName,
      uniqueRatio,
      missingCount,
      duplicateCount,
      isStrictlyUnique,
    });
  }

  return results.sort((a, b) => {
    if (a.isStrictlyUnique !== b.isStrictlyUnique) return a.isStrictlyUnique ? -1 : 1;
    return b.uniqueRatio - a.uniqueRatio;
  });
}

/**
 * Evaluates and resolves deterministic logical row IDs (`rowUid`) using the selected strategy.
 *
 * - Detects missing key values and duplicate key collisions cleanly.
 * - Never relies on physical row numbers as permanent identifiers (only tracks `sheetRowNumber` as volatile location metadata).
 * - Never mutates the source spreadsheet.
 */
export function evaluateRowIdentities(input: {
  tabScope: string; // e.g. `${connectionId}:${sheetId}`
  strategy: SheetIdentityStrategy;
  keyColumns: string[];
  rows: RowInputForIdentity[];
}): SheetIdentityAuditResult {
  const { tabScope, strategy, keyColumns, rows } = input;
  const activeKeyCols = keyColumns.filter((k) => k && k.trim().length > 0);

  const keyOccurrences = new Map<string, number[]>();
  const missingKeyRowNumbers: number[] = [];

  const preliminary = rows.map((row) => {
    const parts = activeKeyCols.map((colKey) => normalizeKeyPart(row.values[colKey]));
    const hasMissingKey =
      activeKeyCols.length === 0 ||
      (strategy === 'column_key' || strategy === 'metadata_column'
        ? parts[0] === ''
        : parts.every((p) => p === ''));

    if (hasMissingKey) {
      missingKeyRowNumbers.push(row.sheetRowNumber);
    }

    const keySignature = hasMissingKey
      ? `__missing__:${deterministicHashHex(JSON.stringify(row.values))}`
      : parts.join('\u001f');

    const occList = keyOccurrences.get(keySignature) || [];
    occList.push(row.sheetRowNumber);
    keyOccurrences.set(keySignature, occList);

    return {
      sheetRowNumber: row.sheetRowNumber,
      values: row.values,
      keySignature,
      hasMissingKey,
      occurrenceIndex: occList.length,
    };
  });

  const duplicates: SheetIdentityDuplicateEntry[] = [];
  for (const [keySignature, rowNumbers] of keyOccurrences.entries()) {
    if (rowNumbers.length > 1 && !keySignature.startsWith('__missing__:')) {
      duplicates.push({ keySignature, rowNumbers });
    }
  }

  const resolvedRows = preliminary.map((item) => {
    const occCount = keyOccurrences.get(item.keySignature)?.length || 1;
    const isDuplicate = !item.hasMissingKey && occCount > 1;
    // Disambiguate collisions deterministically without depending on physical row number
    const rawIdentityPayload =
      strategy === 'column_key' || strategy === 'metadata_column'
        ? `${tabScope}|${strategy}|${item.keySignature}${isDuplicate ? `#dup${item.occurrenceIndex}` : ''}`
        : `${tabScope}|composite|${item.keySignature}${isDuplicate ? `#dup${item.occurrenceIndex}` : ''}`;

    const rowUid = `row_${deterministicHashHex(rawIdentityPayload).slice(0, 24)}`;

    return {
      sheetRowNumber: item.sheetRowNumber,
      rowUid,
      keySignature: item.keySignature,
      isDuplicate,
      hasMissingKey: item.hasMissingKey,
      values: item.values,
    };
  });

  const uniqueCount = keyOccurrences.size;
  const isUnique = duplicates.length === 0 && missingKeyRowNumbers.length === 0;

  return {
    strategy,
    keyColumns: activeKeyCols,
    totalRows: rows.length,
    uniqueCount,
    isUnique,
    missingKeyRowNumbers,
    duplicates,
    resolvedRows,
  };
}

/**
 * Computes a stable content hash over a row's normalized scalar values (used for 3-way diffing).
 */
export function computeRowContentHash(values: Record<string, SheetCellScalar>): string {
  const keys = Object.keys(values).sort();
  const normalizedPairs = keys.map((k) => [k, values[k] ?? null]);
  return deterministicHashHex(JSON.stringify(normalizedPairs));
}

/**
 * Packs synced rows into Firestore-safe tab chunks enforcing BOTH:
 * 1. Row count target (`maxRowsPerChunk`, default 150)
 * 2. Strict serialized UTF-8 byte cap (`maxBytesPerChunk`, default 700,000 bytes — safely below Firestore's 1 MiB limit)
 *
 * Handles long notes and large cell payloads without ever exceeding Firestore's document size limit.
 */
export function packRowsIntoChunks(input: {
  connectionId: string;
  tabId: string;
  userId: string;
  rows: SheetSyncedRow[];
  maxRowsPerChunk?: number;
  maxBytesPerChunk?: number;
  updatedAt?: string;
}): SheetChunkPackResult {
  const {
    connectionId,
    tabId,
    userId,
    rows,
    maxRowsPerChunk = DEFAULT_CHUNK_MAX_ROWS,
    maxBytesPerChunk = DEFAULT_CHUNK_MAX_BYTES,
    updatedAt = new Date().toISOString(),
  } = input;

  const safeMaxRows = Math.max(1, Math.min(200, maxRowsPerChunk));
  const safeMaxBytes = Math.max(16_000, Math.min(850_000, maxBytesPerChunk));

  const chunks: SheetRowChunk[] = [];
  const oversizedRowUids: string[] = [];

  let currentRows: Record<string, SheetSyncedRow> = {};
  let currentRowCount = 0;
  let currentBytes = CHUNK_ENVELOPE_OVERHEAD_BYTES;
  let maxChunkBytes = 0;

  const flushChunk = () => {
    if (currentRowCount === 0) return;
    const chunkIndex = chunks.length;
    const serializedBytes = utf8ByteLength(JSON.stringify(currentRows)) + CHUNK_ENVELOPE_OVERHEAD_BYTES;
    maxChunkBytes = Math.max(maxChunkBytes, serializedBytes);
    chunks.push({
      id: `${tabId}__c${chunkIndex}`,
      connectionId,
      tabId,
      userId,
      chunkIndex,
      rowCount: currentRowCount,
      byteSize: serializedBytes,
      rows: currentRows,
      updatedAt,
    });
    currentRows = {};
    currentRowCount = 0;
    currentBytes = CHUNK_ENVELOPE_OVERHEAD_BYTES;
  };

  for (const row of rows) {
    const entryBytes = utf8ByteLength(JSON.stringify({ [row.rowUid]: row })) + 8;

    if (entryBytes + CHUNK_ENVELOPE_OVERHEAD_BYTES > safeMaxBytes) {
      oversizedRowUids.push(row.rowUid);
    }

    const wouldExceedRows = currentRowCount >= safeMaxRows;
    const wouldExceedBytes = currentRowCount > 0 && currentBytes + entryBytes > safeMaxBytes;

    if (wouldExceedRows || wouldExceedBytes) {
      flushChunk();
    }

    currentRows[row.rowUid] = row;
    currentRowCount++;
    currentBytes += entryBytes;
  }

  flushChunk();

  return {
    chunks,
    totalRows: rows.length,
    maxChunkBytes,
    oversizedRowUids,
  };
}

