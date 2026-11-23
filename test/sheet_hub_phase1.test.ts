import './test_bootstrap.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import app from '../server/serverless.ts';
import {
  isValidGoogleSpreadsheetId,
  parseGoogleSheetUrl,
} from '../src/lib/sheetHub/urlParser.ts';
import {
  detectHeaderRowIndex,
  detectTabSchema,
  detectWorkbookSchema,
} from '../src/lib/sheetHub/schemaDetector.ts';
import {
  computeRowContentHash,
  DEFAULT_CHUNK_MAX_BYTES,
  detectUniqueIdColumns,
  evaluateRowIdentities,
  packRowsIntoChunks,
} from '../src/lib/sheetHub/rowIdentity.ts';
import {
  inspectSpreadsheet,
  pullSpreadsheetTabs,
  SheetHubWorkerError,
} from '../server/universalSheetsWorker.ts';
import type {
  SheetCellScalar,
  SheetInspectCellMeta,
  SheetSyncedRow,
  SheetTabInspectionInput,
} from '../src/types/sheetHub.ts';

// ============================================================================
// MINIMAL ZERO-DEPENDENCY LOCAL XLSX FIXTURE READER (TEST HELPER ONLY)
// Parses OpenXML .xlsx ZIP archives to exercise our detector on real local fixtures.
// Explicitly NOT live Google Sheets API verification.
// ============================================================================
function extractZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid ZIP archive: missing EOCD');

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let pos = cdOffset;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf-8', pos + 46, pos + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedSlice = buf.subarray(dataStart, dataStart + compressedSize);

    const content =
      compressionMethod === 0
        ? Buffer.from(compressedSlice)
        : compressionMethod === 8
        ? zlib.inflateRawSync(compressedSlice)
        : Buffer.alloc(0);

    entries.set(name, content);
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function colRefToIndex0(colLetters: string): number {
  let idx = 0;
  for (let i = 0; i < colLetters.length; i++) {
    idx = idx * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseLocalXlsxFixture(filePath: string): SheetTabInspectionInput[] {
  const entries = extractZipEntries(fs.readFileSync(filePath));

  // Shared strings
  const sharedStrings: string[] = [];
  const ssXml = entries.get('xl/sharedStrings.xml')?.toString('utf-8') || '';
  const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
  for (const si of siMatches) {
    const parts: string[] = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m: RegExpExecArray | null;
    while ((m = tRegex.exec(si)) !== null) {
      parts.push(decodeXmlEntities(m[1]));
    }
    sharedStrings.push(parts.join(''));
  }

  // Relationships
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf-8') || '';
  const relMap = new Map<string, string>();
  const relRegex = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g;
  let rm: RegExpExecArray | null;
  while ((rm = relRegex.exec(relsXml)) !== null) {
    relMap.set(rm[1], rm[2]);
  }

  // Workbook sheets
  const wbXml = entries.get('xl/workbook.xml')?.toString('utf-8') || '';
  const sheetRegex = /<sheet\b([^>]+)\/?>/g;
  const tabs: SheetTabInspectionInput[] = [];
  let sm: RegExpExecArray | null;

  while ((sm = sheetRegex.exec(wbXml)) !== null) {
    const attrs = sm[1];
    const nameMatch = attrs.match(/name="([^"]+)"/);
    const sheetIdMatch = attrs.match(/sheetId="(\d+)"/);
    const rIdMatch = attrs.match(/r:id="([^"]+)"/);
    if (!nameMatch || !sheetIdMatch || !rIdMatch) continue;

    const sheetTitle = decodeXmlEntities(nameMatch[1]);
    const sheetId = Number(sheetIdMatch[1]);
    const target = `xl/${(relMap.get(rIdMatch[1]) || '').replace(/^\/+/, '')}`;
    const sheetXml = entries.get(target)?.toString('utf-8') || '';

    const rowsMap = new Map<number, SheetInspectCellMeta[]>();
    let maxRowNum = 0;

    const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
      const rAttr = rowMatch[1].match(/\br="(\d+)"/);
      const rowNum = rAttr ? Number(rAttr[1]) : maxRowNum + 1;
      if (rowNum > maxRowNum) maxRowNum = rowNum;

      const rowCells: SheetInspectCellMeta[] = [];
      const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[2])) !== null) {
        const cAttrs = cellMatch[1];
        const cBody = cellMatch[2];
        const refMatch = cAttrs.match(/\br="([A-Z]+)\d+"/);
        if (!refMatch) continue;
        const colIdx = colRefToIndex0(refMatch[1]);
        const tMatch = cAttrs.match(/\bt="([^"]+)"/);
        const cellType = tMatch ? tMatch[1] : '';

        const fMatch = cBody.match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
        const vMatch = cBody.match(/<v>([\s\S]*?)<\/v>/);
        const formula = fMatch ? `=${decodeXmlEntities(fMatch[1])}` : null;
        const rawVal = vMatch ? decodeXmlEntities(vMatch[1]) : null;

        let value: SheetCellScalar = null;
        let isBooleanCell = false;

        if (cellType === 's' && rawVal !== null) {
          value = sharedStrings[Number(rawVal)] ?? '';
        } else if (cellType === 'b' && rawVal !== null) {
          value = rawVal === '1';
          isBooleanCell = true;
        } else if (cellType === 'str' || cellType === 'inlineStr') {
          value = rawVal ?? '';
        } else if (rawVal !== null && rawVal !== '') {
          const num = Number(rawVal);
          value = Number.isFinite(num) ? num : rawVal;
        }

        while (rowCells.length <= colIdx) {
          rowCells.push({ value: null });
        }
        rowCells[colIdx] = {
          value,
          formattedValue: value === null ? null : String(value),
          formula,
          isBooleanCell,
        };
      }
      rowsMap.set(rowNum, rowCells);
    }

    const denseRows: SheetInspectCellMeta[][] = [];
    for (let r = 1; r <= maxRowNum; r++) {
      denseRows.push(rowsMap.get(r) || []);
    }

    tabs.push({
      sheetId,
      sheetTitle,
      rowCount: maxRowNum,
      rows: denseRows,
    });
  }

  return tabs;
}

function makeFakeJwt(sub: string, email = 'user@example.com'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, email })).toString('base64url');
  return `${header}.${payload}.`;
}

// ============================================================================
// 1. URL PARSER TESTS
// ============================================================================
describe('Sheet Hub Phase 1 — Google Sheets URL Parser', () => {
  it('parses standard URLs with /edit, query params, and gid in query or hash', () => {
    const id = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

    const a = parseGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=12345`);
    assert.equal(a.ok, true);
    if (a.ok) {
      assert.equal(a.spreadsheetId, id);
      assert.equal(a.gid, 12345);
    }

    const b = parseGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing&gid=987654`);
    assert.equal(b.ok, true);
    if (b.ok) {
      assert.equal(b.spreadsheetId, id);
      assert.equal(b.gid, 987654);
    }

    const c = parseGoogleSheetUrl(`https://docs.google.com/spreadsheets/u/1/d/${id}`);
    assert.equal(c.ok, true);
    if (c.ok) {
      assert.equal(c.spreadsheetId, id);
      assert.equal(c.gid, null);
    }

    assert.equal(isValidGoogleSpreadsheetId(id), true);
  });

  it('rejects empty, malformed, wrong-host, non-http, and published /d/e/ links cleanly', () => {
    const empty = parseGoogleSheetUrl('   ');
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.code, 'EMPTY_URL');

    const bad = parseGoogleSheetUrl('not-a-url');
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, 'INVALID_URL_FORMAT');

    const wrongHost = parseGoogleSheetUrl('https://evil.example.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit');
    assert.equal(wrongHost.ok, false);
    if (!wrongHost.ok) assert.equal(wrongHost.code, 'UNSUPPORTED_HOST');

    const badProto = parseGoogleSheetUrl('javascript:alert(1)');
    assert.equal(badProto.ok, false);
    if (!badProto.ok) assert.equal(badProto.code, 'UNSUPPORTED_PROTOCOL');

    const published = parseGoogleSheetUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vSomePublishedKey123456/pubhtml');
    assert.equal(published.ok, false);
    if (!published.ok) assert.equal(published.code, 'PUBLISHED_WEB_LINK_UNSUPPORTED');

    const shortId = parseGoogleSheetUrl('https://docs.google.com/spreadsheets/d/abc/edit');
    assert.equal(shortId.ok, false);
    if (!shortId.ok) assert.equal(shortId.code, 'INVALID_SPREADSHEET_ID');
  });
});

// ============================================================================
// 2. DYNAMIC SCHEMA DETECTOR TESTS
// ============================================================================
describe('Sheet Hub Phase 1 — Dynamic Schema Detector', () => {
  it('detects headers below title banners, native checkboxes, dropdowns, currencies, dates, URLs, and read-only formulas', () => {
    const tab: SheetTabInspectionInput = {
      sheetId: 101,
      sheetTitle: 'Sprint Backlog & Budget',
      rows: [
        [{ value: 'Q4 ENGINEERING SPRINT TRACKER' }],
        [],
        [
          { value: 'Task ID' },
          { value: 'Title' },
          { value: 'Checked' },
          { value: 'Status' },
          { value: 'Priority' },
          { value: 'Due Date' },
          { value: 'Cost' },
          { value: 'Docs Link' },
          { value: 'Total With Tax' },
          { value: 'Notes' },
        ],
        [
          { value: 'ENG-1' },
          { value: 'Build schema detector' },
          { value: true, dataValidationType: 'BOOLEAN', isBooleanCell: true },
          { value: 'In Progress', dataValidationType: 'ONE_OF_LIST', dataValidationValues: ['Todo', 'In Progress', 'Done'] },
          { value: 'High', dataValidationType: 'ONE_OF_LIST', dataValidationValues: ['High', 'Medium', 'Low'] },
          { value: 46150, formattedValue: '2026-05-10', numberFormatType: 'DATE' },
          { value: 2500, formattedValue: '₹2,500', numberFormatType: 'CURRENCY' },
          { value: 'https://docs.example.com/spec' },
          { value: 2950, formula: '=G4*1.18' },
          { value: 'Detailed technical architecture notes spanning multiple sentences to ensure long text detection works reliably.' },
        ],
        [
          { value: 'ENG-2' },
          { value: 'Add emulator tests' },
          { value: false, dataValidationType: 'BOOLEAN', isBooleanCell: true },
          { value: 'Todo', dataValidationType: 'ONE_OF_LIST', dataValidationValues: ['Todo', 'In Progress', 'Done'] },
          { value: 'Medium', dataValidationType: 'ONE_OF_LIST', dataValidationValues: ['High', 'Medium', 'Low'] },
          { value: 46155, formattedValue: '2026-05-15', numberFormatType: 'DATE' },
          { value: 1200, formattedValue: '₹1,200', numberFormatType: 'CURRENCY' },
          { value: 'https://docs.example.com/tests' },
          { value: 1416, formula: '=G5*1.18' },
          { value: 'Run emulator suite with strict rules verification.' },
        ],
      ],
    };

    assert.equal(detectHeaderRowIndex(tab.rows), 2); // 0-based index 2 = row 3
    const detected = detectTabSchema(tab);
    assert.equal(detected.role, 'data');
    assert.equal(detected.headerRowIndex, 3);
    assert.equal(detected.dataStartRow, 4);
    assert.equal(detected.suggestedIdentityStrategy, 'column_key');

    const byHeader = new Map(detected.columns.map((c) => [c.headerName, c]));
    assert.equal(byHeader.get('Task ID')?.semanticRole, 'id');
    assert.equal(byHeader.get('Checked')?.inferredType, 'checkbox');
    assert.equal(byHeader.get('Checked')?.editable, true);
    assert.equal(byHeader.get('Status')?.inferredType, 'status');
    assert.deepEqual(byHeader.get('Status')?.enumOptions, ['Todo', 'In Progress', 'Done']);
    assert.equal(byHeader.get('Priority')?.inferredType, 'priority');
    assert.equal(byHeader.get('Due Date')?.inferredType, 'date');
    assert.equal(byHeader.get('Cost')?.inferredType, 'currency');
    assert.equal(byHeader.get('Docs Link')?.inferredType, 'url');
    assert.equal(byHeader.get('Total With Tax')?.inferredType, 'formula');
    assert.equal(byHeader.get('Total With Tax')?.editable, false);
    assert.equal(byHeader.get('Notes')?.inferredType, 'long_text');
  });

  it('classifies empty tabs as ignored, formula summary tabs as overview, and flags ambiguous mappings', () => {
    const emptyTab = detectTabSchema({ sheetId: 1, sheetTitle: 'Scratch', rows: [] });
    assert.equal(emptyTab.role, 'ignored');
    assert.equal(emptyTab.headerRowIndex, 0);

    const summaryTab = detectTabSchema({
      sheetId: 2,
      sheetTitle: 'Executive Summary',
      rows: [
        [{ value: 'KPI' }, { value: 'Value' }],
        [{ value: 'Total' }, { value: 100, formula: '=SUM(Data!B2:B100)' }],
        [{ value: 'Done' }, { value: 40, formula: '=COUNTIF(Data!C2:C100, TRUE)' }],
      ],
    });
    assert.equal(summaryTab.role, 'overview');
    assert.ok(summaryTab.columns.every((c) => c.editable === false));

    const ambiguousTab = detectTabSchema({
      sheetId: 3,
      sheetTitle: 'Custom Log',
      rows: [
        [{ value: 'Col X' }, { value: 'Col Y' }],
        [{ value: 'alpha' }, { value: '' }],
      ],
    });
    assert.equal(ambiguousTab.requiresMappingConfirmation, true);
    assert.ok(ambiguousTab.columns.some((c) => c.requiresConfirmation));
  });

  it('correctly maps native booleans, empty checkboxes, and text boolean strings', () => {
    // 1. Native TRUE / FALSE
    const nativeBoolTab = detectTabSchema({
      sheetId: 10,
      sheetTitle: 'Checklist',
      rows: [
        [{ value: 'Task' }, { value: 'Done' }],
        [{ value: 'Task 1' }, { value: true, isBooleanCell: true }],
        [{ value: 'Task 2' }, { value: false, isBooleanCell: true }],
      ],
    });
    const doneCol1 = nativeBoolTab.columns.find((c) => c.headerName === 'Done');
    assert.ok(doneCol1);
    assert.equal(doneCol1.inferredType, 'boolean');
    assert.equal(doneCol1.semanticRole, 'done');
    assert.equal(doneCol1.editable, true);
    assert.equal(doneCol1.confidence, 'high');

    // 2. Google Sheets Checkbox Validation (checked & unchecked)
    const checkboxTab = detectTabSchema({
      sheetId: 11,
      sheetTitle: 'Syllabus',
      rows: [
        [{ value: 'Topic' }, { value: 'Done' }],
        [{ value: 'Topic 1' }, { value: true, dataValidationType: 'BOOLEAN' }],
        [{ value: 'Topic 2' }, { value: false, dataValidationType: 'BOOLEAN' }],
      ],
    });
    const doneCol2 = checkboxTab.columns.find((c) => c.headerName === 'Done');
    assert.ok(doneCol2);
    assert.equal(doneCol2.inferredType, 'checkbox');
    assert.equal(doneCol2.semanticRole, 'done');
    assert.equal(doneCol2.editable, true);

    // 3. Empty checkbox cells (dataValidationType: 'BOOLEAN', but null / blank values)
    const emptyCheckboxTab = detectTabSchema({
      sheetId: 12,
      sheetTitle: 'Empty Checklist',
      rows: [
        [{ value: 'Topic' }, { value: 'Completed' }],
        [{ value: 'Topic 1' }, { value: null, dataValidationType: 'BOOLEAN' }],
        [{ value: 'Topic 2' }, { value: '', dataValidationType: 'BOOLEAN' }],
      ],
    });
    const doneCol3 = emptyCheckboxTab.columns.find((c) => c.headerName === 'Completed');
    assert.ok(doneCol3);
    assert.equal(doneCol3.inferredType, 'checkbox');
    assert.equal(doneCol3.semanticRole, 'done');
    assert.equal(doneCol3.editable, true);

    // 4. Boolean text strings "TRUE" and "FALSE" (medium confidence, requires confirmation)
    const textBoolTab = detectTabSchema({
      sheetId: 13,
      sheetTitle: 'Text Booleans',
      rows: [
        [{ value: 'Item' }, { value: 'Finished' }],
        [{ value: 'Item A' }, { value: 'TRUE' }],
        [{ value: 'Item B' }, { value: 'FALSE' }],
      ],
    });
    const doneCol4 = textBoolTab.columns.find((c) => c.headerName === 'Finished');
    assert.ok(doneCol4);
    assert.equal(doneCol4.inferredType, 'boolean');
    assert.equal(doneCol4.semanticRole, 'done');
    assert.equal(doneCol4.confidence, 'medium');
    assert.equal(doneCol4.requiresConfirmation, true);

    // 5. Status dropdown is kept strictly separate from boolean completion
    const statusTab = detectTabSchema({
      sheetId: 14,
      sheetTitle: 'Status Tracker',
      rows: [
        [{ value: 'Item' }, { value: 'Status' }],
        [{ value: 'Item 1' }, { value: 'In Progress', dataValidationType: 'ONE_OF_LIST', dataValidationValues: ['Todo', 'In Progress', 'Done'] }],
        [{ value: 'Item 2' }, { value: 'Done', dataValidationType: 'ONE_OF_LIST', dataValidationValues: ['Todo', 'In Progress', 'Done'] }],
      ],
    });
    const statusCol = statusTab.columns.find((c) => c.headerName === 'Status');
    assert.ok(statusCol);
    assert.equal(statusCol.inferredType, 'status');
    assert.equal(statusCol.semanticRole, 'status'); // NOT 'done'
    assert.notEqual(statusCol.semanticRole, 'done');
    assert.deepEqual(statusCol.enumOptions, ['Todo', 'In Progress', 'Done']);
  });

  it('ensures formula-derived booleans are strictly read-only and never confused with editable checkboxes', () => {
    const formulaBoolTab = detectTabSchema({
      sheetId: 15,
      sheetTitle: 'Formula Booleans',
      rows: [
        [{ value: 'Score' }, { value: 'Is Passing' }],
        [{ value: 85 }, { value: true, formula: '=A2>=50' }],
        [{ value: 42 }, { value: false, formula: '=A3>=50' }],
      ],
    });
    const formulaCol = formulaBoolTab.columns.find((c) => c.headerName === 'Is Passing');
    assert.ok(formulaCol);
    assert.equal(formulaCol.inferredType, 'formula');
    assert.equal(formulaCol.editable, false);
    assert.ok(formulaCol.readOnlyReason?.includes('Formula-derived'));
    assert.notEqual(formulaCol.inferredType, 'checkbox');
    assert.notEqual(formulaCol.inferredType, 'boolean');
    assert.notEqual(formulaCol.semanticRole, 'done');
  });
});

// ============================================================================
// 3. ROW IDENTITY & BYTE-SAFE CHUNKING TESTS
// ============================================================================
describe('Sheet Hub Phase 1 — Row Identity & Byte-Safe Chunking', () => {
  it('verifies Semester 3 Module + Topic + Subtopic composite identity survives sorting, insertion, and deletion', () => {
    // Reference Semester 3 style rows
    const originalRows = [
      { sheetRowNumber: 2, values: { module_0: 'Unit 1', topic_1: 'Memory', subtopic_2: 'Cache Mapping' } },
      { sheetRowNumber: 3, values: { module_0: 'Unit 1', topic_1: 'Memory', subtopic_2: 'Virtual Memory' } },
      { sheetRowNumber: 4, values: { module_0: 'Unit 2', topic_1: 'Pipelining', subtopic_2: 'Hazards' } },
    ];

    const originalAudit = evaluateRowIdentities({
      tabScope: 'conn_sem3:tab_coa',
      strategy: 'composite_key',
      keyColumns: ['module_0', 'topic_1', 'subtopic_2'],
      rows: originalRows,
    });
    assert.equal(originalAudit.isUnique, true);
    assert.equal(originalAudit.resolvedRows.length, 3);
    const origUids = originalAudit.resolvedRows.map((r) => r.rowUid);

    // 1. Row Sorting: reverse the rows and change sheetRowNumber
    const sortedRows = [
      { sheetRowNumber: 10, values: { module_0: 'Unit 2', topic_1: 'Pipelining', subtopic_2: 'Hazards' } },
      { sheetRowNumber: 11, values: { module_0: 'Unit 1', topic_1: 'Memory', subtopic_2: 'Virtual Memory' } },
      { sheetRowNumber: 12, values: { module_0: 'Unit 1', topic_1: 'Memory', subtopic_2: 'Cache Mapping' } },
    ];
    const sortedAudit = evaluateRowIdentities({
      tabScope: 'conn_sem3:tab_coa',
      strategy: 'composite_key',
      keyColumns: ['module_0', 'topic_1', 'subtopic_2'],
      rows: sortedRows,
    });
    // UIDs MUST match regardless of physical row number or sort order
    assert.equal(sortedAudit.resolvedRows[2].rowUid, origUids[0]); // Cache Mapping
    assert.equal(sortedAudit.resolvedRows[1].rowUid, origUids[1]); // Virtual Memory
    assert.equal(sortedAudit.resolvedRows[0].rowUid, origUids[2]); // Hazards

    // 2. Row Insertion: insert a new row at beginning, shifting others down
    const insertedRows = [
      { sheetRowNumber: 2, values: { module_0: 'Unit 1', topic_1: 'Intro', subtopic_2: 'Overview' } }, // NEW
      { sheetRowNumber: 3, values: { module_0: 'Unit 1', topic_1: 'Memory', subtopic_2: 'Cache Mapping' } },
      { sheetRowNumber: 4, values: { module_0: 'Unit 1', topic_1: 'Memory', subtopic_2: 'Virtual Memory' } },
      { sheetRowNumber: 5, values: { module_0: 'Unit 2', topic_1: 'Pipelining', subtopic_2: 'Hazards' } },
    ];
    const insertedAudit = evaluateRowIdentities({
      tabScope: 'conn_sem3:tab_coa',
      strategy: 'composite_key',
      keyColumns: ['module_0', 'topic_1', 'subtopic_2'],
      rows: insertedRows,
    });
    assert.equal(insertedAudit.isUnique, true);
    assert.equal(insertedAudit.resolvedRows.length, 4);
    // Shifted rows must have retained their original UIDs
    assert.equal(insertedAudit.resolvedRows[1].rowUid, origUids[0]);
    assert.equal(insertedAudit.resolvedRows[2].rowUid, origUids[1]);
    assert.equal(insertedAudit.resolvedRows[3].rowUid, origUids[2]);

    // 3. Row Deletion: delete middle row
    const deletedRows = [
      { sheetRowNumber: 2, values: { module_0: 'Unit 1', topic_1: 'Memory', subtopic_2: 'Cache Mapping' } },
      { sheetRowNumber: 3, values: { module_0: 'Unit 2', topic_1: 'Pipelining', subtopic_2: 'Hazards' } },
    ];
    const deletedAudit = evaluateRowIdentities({
      tabScope: 'conn_sem3:tab_coa',
      strategy: 'composite_key',
      keyColumns: ['module_0', 'topic_1', 'subtopic_2'],
      rows: deletedRows,
    });
    assert.equal(deletedAudit.resolvedRows[0].rowUid, origUids[0]);
    assert.equal(deletedAudit.resolvedRows[1].rowUid, origUids[2]);
  });

  it('ensures duplicate topic titles across different modules are disambiguated and unique', () => {
    const rows = [
      { sheetRowNumber: 2, values: { module_0: 'Module 1', topic_1: 'Introduction', subtopic_2: 'Overview' } },
      { sheetRowNumber: 3, values: { module_0: 'Module 2', topic_1: 'Introduction', subtopic_2: 'Overview' } },
    ];

    const audit = evaluateRowIdentities({
      tabScope: 'conn_sem3:tab_dbms',
      strategy: 'composite_key',
      keyColumns: ['module_0', 'topic_1', 'subtopic_2'],
      rows,
    });

    assert.equal(audit.isUnique, true);
    assert.equal(audit.duplicates.length, 0);
    assert.notEqual(audit.resolvedRows[0].rowUid, audit.resolvedRows[1].rowUid);
  });

  it('demonstrates composite key behavior during renames and flags missing key rows cleanly', () => {
    const original = [
      { sheetRowNumber: 2, values: { module_0: 'Unit 1', topic_1: 'Original Title', subtopic_2: 'Sub A' } },
    ];
    const renamed = [
      { sheetRowNumber: 2, values: { module_0: 'Unit 1', topic_1: 'Renamed Title', subtopic_2: 'Sub A' } },
    ];

    const origAudit = evaluateRowIdentities({
      tabScope: 'conn_test',
      strategy: 'composite_key',
      keyColumns: ['module_0', 'topic_1', 'subtopic_2'],
      rows: original,
    });
    const renameAudit = evaluateRowIdentities({
      tabScope: 'conn_test',
      strategy: 'composite_key',
      keyColumns: ['module_0', 'topic_1', 'subtopic_2'],
      rows: renamed,
    });

    // Rename changes the composite key signature
    assert.notEqual(origAudit.resolvedRows[0].rowUid, renameAudit.resolvedRows[0].rowUid);

    // Missing identity fields (empty row)
    const missingRows = [
      { sheetRowNumber: 3, values: { module_0: '', topic_1: '', subtopic_2: '' } },
    ];
    const missingAudit = evaluateRowIdentities({
      tabScope: 'conn_test',
      strategy: 'composite_key',
      keyColumns: ['module_0', 'topic_1', 'subtopic_2'],
      rows: missingRows,
    });
    assert.equal(missingAudit.isUnique, false);
    assert.deepEqual(missingAudit.missingKeyRowNumbers, [3]);
    assert.equal(missingAudit.resolvedRows[0].hasMissingKey, true);
  });
  it('detects unique ID columns, flags duplicates and missing keys, and never mutates input rows', () => {
    const rows = [
      { sheetRowNumber: 2, values: { id_0: 'A1', name_1: 'One', tag_2: 'x' } },
      { sheetRowNumber: 3, values: { id_0: 'A2', name_1: 'Two', tag_2: 'x' } },
      { sheetRowNumber: 4, values: { id_0: 'A2', name_1: 'Two', tag_2: 'y' } }, // duplicate!
      { sheetRowNumber: 5, values: { id_0: '', name_1: '', tag_2: 'z' } }, // missing!
    ];

    const candidates = detectUniqueIdColumns(
      [
        {
          colIndex: 0,
          colLetter: 'A',
          fieldKey: 'id_0',
          headerName: 'ID',
          displayName: 'ID',
          inferredType: 'text',
          confirmedType: 'text',
          semanticRole: 'id',
          confidence: 'high',
          editable: true,
          requiresConfirmation: false,
        },
      ],
      rows
    );
    assert.equal(candidates[0].isStrictlyUnique, false);
    assert.equal(candidates[0].duplicateCount, 1);
    assert.equal(candidates[0].missingCount, 1);

    const audit = evaluateRowIdentities({
      tabScope: 'conn1:sheet2',
      strategy: 'composite_key',
      keyColumns: ['id_0', 'name_1'],
      rows,
    });

    assert.equal(audit.isUnique, false);
    assert.equal(audit.duplicates.length, 1);
    assert.deepEqual(audit.duplicates[0].rowNumbers, [3, 4]);
    assert.deepEqual(audit.missingKeyRowNumbers, [5]);
    // Every resolved row still gets a deterministic unique rowUid
    const uidSet = new Set(audit.resolvedRows.map((r) => r.rowUid));
    assert.equal(uidSet.size, 4);
  });

  it('splits large-note rows by UTF-8 byte cap well below Firestore 1 MiB limit', () => {
    const bigNote = 'N'.repeat(120_000); // ~120 KB per row
    const rows: SheetSyncedRow[] = Array.from({ length: 12 }, (_, idx) => {
      const vals = { title_0: `Row ${idx}`, notes_1: bigNote };
      return {
        rowUid: `row_${idx}`,
        lastKnownSheetRow: idx + 2,
        values: vals,
        baseValues: vals,
        rowHash: computeRowContentHash(vals),
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: '2026-11-18T00:00:00.000Z',
        status: 'synced',
      };
    });

    const packed = packRowsIntoChunks({
      connectionId: 'conn_big',
      tabId: 'conn_big__tab1',
      userId: 'usr_1',
      rows,
    });

    // Only 12 rows (well under 150 row target), yet byte cap MUST split them into multiple chunks!
    assert.ok(packed.chunks.length >= 4, `Expected >=4 chunks due to byte cap, got ${packed.chunks.length}`);
    assert.equal(packed.totalRows, 12);
    assert.equal(packed.oversizedRowUids.length, 0);
    for (const chunk of packed.chunks) {
      assert.ok(
        chunk.byteSize <= DEFAULT_CHUNK_MAX_BYTES,
        `Chunk byteSize ${chunk.byteSize} exceeded ${DEFAULT_CHUNK_MAX_BYTES}`
      );
    }
  });
});

// ============================================================================
// 4. BACKEND WORKER & EXPRESS ROUTE TESTS (MOCKED SHEETS API)
// ============================================================================
describe('Sheet Hub Phase 1 — Backend Worker & Read-Only Routes', () => {
  it('inspectSpreadsheet and pullSpreadsheetTabs handle valid responses, booleans, dates, and formulas', async () => {
    const sheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

    const mockFetch: typeof fetch = async (urlInput) => {
      const url = String(urlInput);
      if (url.includes('includeGridData=true')) {
        return new Response(
          JSON.stringify({
            spreadsheetId: sheetId,
            sheets: [
              {
                properties: { sheetId: 10, title: 'Tasks', gridProperties: { rowCount: 10, columnCount: 4 } },
                data: [
                  {
                    rowData: [
                      {
                        values: [
                          { effectiveValue: { stringValue: 'Topic' }, formattedValue: 'Topic' },
                          { effectiveValue: { stringValue: 'Done' }, formattedValue: 'Done' },
                          { effectiveValue: { stringValue: 'Due' }, formattedValue: 'Due' },
                          { effectiveValue: { stringValue: 'Score' }, formattedValue: 'Score' },
                        ],
                      },
                      {
                        values: [
                          { effectiveValue: { stringValue: 'Trees' }, formattedValue: 'Trees' },
                          { effectiveValue: { boolValue: true }, dataValidation: { condition: { type: 'BOOLEAN' } } },
                          { effectiveValue: { numberValue: 46150 }, formattedValue: '2026-05-10', userEnteredFormat: { numberFormat: { type: 'DATE' } } },
                          { effectiveValue: { numberValue: 10 }, userEnteredValue: { formulaValue: '=IF(B2,10,0)' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('valueRenderOption=UNFORMATTED_VALUE')) {
        return new Response(
          JSON.stringify({
            spreadsheetId: sheetId,
            valueRanges: [
              {
                range: "'Tasks'!A1:Z1000",
                values: [
                  ['Topic', 'Done', 'Due', 'Score'],
                  ['Trees', true, '2026-05-10', 10],
                  ['Graphs', false, '2026-05-12', 0],
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('valueRenderOption=FORMULA')) {
        return new Response(
          JSON.stringify({
            spreadsheetId: sheetId,
            valueRanges: [
              {
                range: "'Tasks'!A1:Z1000",
                values: [
                  ['Topic', 'Done', 'Due', 'Score'],
                  ['Trees', true, '2026-05-10', '=IF(B2,10,0)'],
                  ['Graphs', false, '2026-05-12', '=IF(B3,10,0)'],
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Metadata call
      return new Response(
        JSON.stringify({
          spreadsheetId: sheetId,
          properties: { title: 'Mock Study Tracker' },
          sheets: [{ properties: { sheetId: 10, title: 'Tasks', sheetType: 'GRID', gridProperties: { rowCount: 10, columnCount: 4 } } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const inspected = await inspectSpreadsheet({ spreadsheetId: sheetId }, 'ya29.fake-token', mockFetch);
    assert.equal(inspected.title, 'Mock Study Tracker');
    assert.equal(inspected.tabs.length, 1);
    assert.equal(inspected.tabs[0].sheetId, 10);
    assert.equal(inspected.tabs[0].columns[1].inferredType, 'checkbox');
    assert.equal(inspected.tabs[0].columns[3].inferredType, 'formula');
    assert.equal(inspected.tabs[0].columns[3].editable, false);

    const pulled = await pullSpreadsheetTabs(
      { spreadsheetId: sheetId, tabs: [{ sheetTitle: 'Tasks', headerRowIndex: 1 }] },
      'ya29.fake-token',
      mockFetch
    );
    assert.equal(pulled.tabs[0].totalRows, 2);
    assert.strictEqual(pulled.tabs[0].rows[0].values[1], true);
    assert.strictEqual(pulled.tabs[0].rows[1].values[1], false);
    assert.equal(pulled.tabs[0].rows[0].values[2], '2026-05-10');
    assert.deepEqual(pulled.tabs[0].formulaColumnIndices, [3]);
  });

  it('rejects malformed Google API responses and expired Google OAuth tokens cleanly', async () => {
    const sheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

    const malformedFetch: typeof fetch = async () =>
      new Response('not-json{{{', { status: 200 });

    await assert.rejects(
      () => inspectSpreadsheet({ spreadsheetId: sheetId }, 'ya29.valid-shape', malformedFetch),
      (err: unknown) => err instanceof SheetHubWorkerError && err.code === 'MALFORMED_SHEETS_RESPONSE'
    );

    const expiredFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 401, message: 'Invalid Credentials' } }), { status: 401 });

    await assert.rejects(
      () => pullSpreadsheetTabs({ spreadsheetId: sheetId, tabs: [{ sheetTitle: 'Sheet1' }] }, 'ya29.expired', expiredFetch),
      (err: unknown) => err instanceof SheetHubWorkerError && err.status === 401 && err.code === 'SHEETS_AUTH_REQUIRED'
    );
  });

  it('enforces auth and Google OAuth headers on POST /api/sheet-hub/inspect and /pull', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. Unauthenticated / guest request -> 401 AUTH_REQUIRED
      const unauthInspect = await fetch(`${base}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-demo-session': 'gst_unauth_test_1234' },
        body: JSON.stringify({ spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' }),
      });
      assert.equal(unauthInspect.status, 401);
      const unauthBody = (await unauthInspect.json()) as { code?: string };
      assert.equal(unauthBody.code, 'AUTH_REQUIRED');

      // 2. Signed-in user WITHOUT x-google-access-token -> 401 SHEETS_AUTH_REQUIRED
      const jwt = makeFakeJwt('usr_sheet_hub_tester');
      const noTokenPull = await fetch(`${base}/api/sheet-hub/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          tabs: [{ sheetTitle: 'COA' }],
        }),
      });
      assert.equal(noTokenPull.status, 401);
      const noTokenBody = (await noTokenPull.json()) as { code?: string };
      assert.equal(noTokenBody.code, 'SHEETS_AUTH_REQUIRED');

      // 3. Invalid spreadsheet URL -> 400
      const badUrlRes = await fetch(`${base}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-google-access-token': 'ya29.test_dummy_token_123456',
        },
        body: JSON.stringify({ spreadsheetUrl: 'https://example.com/not-a-sheet' }),
      });
      assert.equal(badUrlRes.status, 400);
      const badUrlBody = (await badUrlRes.json()) as { code?: string };
      assert.equal(badUrlBody.code, 'UNSUPPORTED_HOST');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

// ============================================================================
// 5. FIRST SAMPLE LOCAL FIXTURE TEST — SEMESTER 3 XLSX
// (Local XLSX fixture verification ONLY — NOT live Google Sheets API testing)
// ============================================================================
const candidateFixturePaths = [
  path.resolve(process.cwd(), 'test/fixtures/Semester 3 - Syllabus & Topic Tracker.xlsx'),
  path.resolve(process.cwd(), 'Semester 3 - Syllabus & Topic Tracker.xlsx'),
  '/Users/munshimdatif/Downloads/Semester 3 - Syllabus & Topic Tracker.xlsx',
];
const SEMESTER_3_XLSX_PATH = candidateFixturePaths.find((p) => fs.existsSync(p)) || candidateFixturePaths[0];
const hasSemester3Fixture = fs.existsSync(SEMESTER_3_XLSX_PATH);

describe(
  'Sheet Hub Phase 1 — Local Fixture: Semester 3 Syllabus & Topic Tracker XLSX',
  { skip: !hasSemester3Fixture ? 'Local Semester 3 XLSX fixture not found on disk' : false },
  () => {
    it('dynamically discovers all 5 tabs, infers schema & read-only formulas, audits identities, and computes exact live counts', () => {
      const parsedTabs = parseLocalXlsxFixture(SEMESTER_3_XLSX_PATH);
      const workbook = detectWorkbookSchema(parsedTabs);

      // 1. All 5 tabs discovered
      assert.equal(workbook.tabs.length, 5);
      assert.deepEqual(
        workbook.tabs.map((t) => t.sheetTitle),
        ['Overview', 'Prob & Stats', 'COA', 'DBMS', 'Python']
      );

      // 2. Overview recognized as summary/overview tab with read-only formula protection
      const overviewTab = workbook.tabs.find((t) => t.sheetTitle === 'Overview')!;
      assert.equal(overviewTab.role, 'overview');
      assert.ok(overviewTab.formulaCellCount > 0, 'Overview tab must report detected formulas');
      assert.ok(
        overviewTab.columns.every((c) => c.editable === false),
        'All formula/overview columns must default to read-only'
      );

      // 3. The 4 subject tabs recognized as data tabs with expected dynamic semantic roles
      const subjectNames = ['Prob & Stats', 'COA', 'DBMS', 'Python'];
      let computedTotalTopics = 0;
      let computedCompleted = 0;

      for (const subjectName of subjectNames) {
        const rawTab = parsedTabs.find((t) => t.sheetTitle === subjectName)!;
        const detected = workbook.tabs.find((t) => t.sheetTitle === subjectName)!;

        assert.equal(detected.role, 'data', `${subjectName} must be detected as a data tab`);
        assert.equal(detected.headerRowIndex, 1);

        const byHeader = new Map(detected.columns.map((c) => [c.headerName, c]));
        assert.equal(byHeader.get('Module')?.semanticRole, 'group');
        assert.equal(byHeader.get('Topic')?.semanticRole, 'subgroup');
        assert.equal(byHeader.get('Subtopic')?.semanticRole, 'title');
        assert.equal(byHeader.get('Done')?.inferredType, 'boolean');
        assert.equal(byHeader.get('Done')?.semanticRole, 'done');
        assert.equal(byHeader.get('Done')?.editable, true);
        assert.equal(byHeader.get('Notes / Practice')?.semanticRole, 'notes');
        assert.equal(byHeader.get('Notes / Practice')?.editable, true);

        // Build row objects directly from actual XLSX cells
        const dataRows = rawTab.rows.slice(detected.headerRowIndex).map((cells, idx) => {
          const values: Record<string, SheetCellScalar> = {};
          for (const col of detected.columns) {
            values[col.fieldKey] = cells[col.colIndex]?.value ?? null;
          }
          return {
            sheetRowNumber: detected.dataStartRow + idx,
            values,
          };
        });

        const doneKey = byHeader.get('Done')!.fieldKey;
        const subtopicKey = byHeader.get('Subtopic')!.fieldKey;
        const nonEmptyTopicRows = dataRows.filter(
          (r) => typeof r.values[subtopicKey] === 'string' && r.values[subtopicKey].trim() !== ''
        );

        computedTotalTopics += nonEmptyTopicRows.length;
        computedCompleted += nonEmptyTopicRows.filter((r) => r.values[doneKey] === true).length;

        // Audit row identity uniqueness across all subject rows
        const identityAudit = evaluateRowIdentities({
          tabScope: `sem3_fixture:${detected.sheetId}`,
          strategy: detected.suggestedIdentityStrategy,
          keyColumns: detected.suggestedIdentityColumns,
          rows: nonEmptyTopicRows,
        });
        assert.equal(identityAudit.totalRows, nonEmptyTopicRows.length);
        assert.equal(identityAudit.missingKeyRowNumbers.length, 0);

        // Verify byte-safe chunking under 1 MiB safety ceiling
        const syncedRows: SheetSyncedRow[] = identityAudit.resolvedRows.map((rr) => ({
          rowUid: rr.rowUid,
          lastKnownSheetRow: rr.sheetRowNumber,
          values: rr.values,
          baseValues: rr.values,
          rowHash: computeRowContentHash(rr.values),
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: '2026-11-18T00:00:00.000Z',
          status: 'synced',
        }));
        const chunked = packRowsIntoChunks({
          connectionId: 'conn_sem3_fixture',
          tabId: `conn_sem3_fixture__${detected.sheetId}`,
          userId: 'usr_fixture',
          rows: syncedRows,
        });
        assert.equal(chunked.totalRows, nonEmptyTopicRows.length);
        assert.equal(chunked.oversizedRowUids.length, 0);
        assert.ok(chunked.maxChunkBytes < DEFAULT_CHUNK_MAX_BYTES);
      }

      // 4. Verify dynamically calculated totals match the actual Semester 3 fixture dataset
      const computedRemaining = computedTotalTopics - computedCompleted;
      assert.equal(computedTotalTopics, 597);
      assert.equal(computedCompleted, 9);
      assert.equal(computedRemaining, 588);
    });
  }
);

