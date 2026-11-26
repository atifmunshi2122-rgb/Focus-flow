/**
 * Minimal zero-dependency local XLSX archive reader for testing and sample fixtures.
 * Uses native Node.js zlib/Buffer to parse OpenXML zip packages.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import type { SheetCellScalar, SheetInspectCellMeta, SheetTabInspectionInput } from '../src/types/sheetHub.ts';

const MAX_ZIP_ENTRIES = 500;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;

function extractZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
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
  if (cdOffset < 0 || cdOffset >= buf.length) {
    throw new Error('Invalid ZIP archive: central directory offset out of bounds');
  }
  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new Error(`Invalid XLSX archive: too many ZIP entries (${totalEntries})`);
  }

  let pos = cdOffset;
  let totalUncompressedBytes = 0;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (pos + 46 > buf.length) {
      throw new Error('Invalid ZIP archive: truncated central directory entry');
    }
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const declaredUncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);

    const entryRecordEnd = pos + 46 + nameLen + extraLen + commentLen;
    if (entryRecordEnd > buf.length) {
      throw new Error('Invalid ZIP archive: entry metadata exceeds buffer bounds');
    }

    const name = buf.toString('utf-8', pos + 46, pos + 46 + nameLen);

    if (localHeaderOffset < 0 || localHeaderOffset + 30 > buf.length) {
      throw new Error(`Invalid ZIP archive: local header offset out of bounds for "${name}"`);
    }
    if (buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP archive: invalid local header signature for "${name}"`);
    }

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (
      dataStart < 0 ||
      compressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES ||
      dataEnd > buf.length
    ) {
      throw new Error(`Invalid XLSX archive: entry "${name}" bounds exceed safe archive limits`);
    }
    if (declaredUncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Invalid XLSX archive: entry "${name}" exceeds safe uncompressed size limit`
      );
    }

    const compressedSlice = buf.subarray(dataStart, dataEnd);

    let content: Buffer;
    if (compressionMethod === 0) {
      if (compressedSlice.length > MAX_ENTRY_UNCOMPRESSED_BYTES) {
        throw new Error(`Invalid XLSX archive: stored entry "${name}" exceeds size limit`);
      }
      content = Buffer.from(compressedSlice);
    } else if (compressionMethod === 8) {
      try {
        content = zlib.inflateRawSync(compressedSlice, {
          maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof RangeError || /buffer length|maxOutputLength|too large/i.test(msg)) {
          throw new Error(
            `Invalid XLSX archive: entry "${name}" exceeded safe decompression limit (Zip Bomb protection)`
          );
        }
        throw new Error(`Invalid XLSX archive: failed to inflate "${name}": ${msg}`);
      }
    } else {
      content = Buffer.alloc(0);
    }

    totalUncompressedBytes += content.length;
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('Invalid XLSX archive: total uncompressed size exceeds safe limit');
    }

    entries.set(name, content);
    pos = entryRecordEnd;
  }

  return entries;
}

function decodeXmlEntities(str: string): string {
  return str.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-fA-F]+|#[0-9]+);/g, (full, entity: string) => {
    switch (entity) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      case 'amp':
        return '&';
      default: {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const cp = Number.parseInt(entity.slice(2), 16);
          return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
            ? String.fromCodePoint(cp)
            : full;
        }
        if (entity.startsWith('#')) {
          const cp = Number.parseInt(entity.slice(1), 10);
          return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
            ? String.fromCodePoint(cp)
            : full;
        }
        return full;
      }
    }
  });
}

function colRefToIndex0(colLetters: string): number {
  let idx = 0;
  for (let i = 0; i < colLetters.length; i++) {
    idx = idx * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

export function isZipBuffer(buf: Buffer): boolean {
  return Buffer.isBuffer(buf) && buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;
}

export function parseXlsxBuffer(buf: Buffer): SheetTabInspectionInput[] {
  if (!isZipBuffer(buf)) {
    throw new Error('Invalid XLSX archive: expected ZIP signature');
  }
  const entries = extractZipEntries(buf);

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

  // Workbook sheets mapping
  const wbXml = entries.get('xl/workbook.xml')?.toString('utf-8') || '';
  const sheetMatches = wbXml.match(/<sheet\b[^>]*\/>/g) || [];
  const tabDefs: Array<{ name: string; sheetId: number; rId: string }> = [];
  for (const s of sheetMatches) {
    const nameMatch = s.match(/name="([^"]+)"/);
    const idMatch = s.match(/sheetId="([^"]+)"/);
    const rIdMatch = s.match(/r:id="([^"]+)"/);
    if (nameMatch && idMatch && rIdMatch) {
      tabDefs.push({
        name: decodeXmlEntities(nameMatch[1]),
        sheetId: parseInt(idMatch[1], 10),
        rId: rIdMatch[1],
      });
    }
  }

  // Workbook rels
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf-8') || '';
  const targetMap = new Map<string, string>();
  const relMatches = relsXml.match(/<Relationship\b[^>]*\/>/g) || [];
  for (const r of relMatches) {
    const idMatch = r.match(/Id="([^"]+)"/);
    const targetMatch = r.match(/Target="([^"]+)"/);
    if (idMatch && targetMatch) {
      targetMap.set(idMatch[1], targetMatch[1].replace(/^\//, ''));
    }
  }

  const result: SheetTabInspectionInput[] = [];

  for (const tab of tabDefs) {
    const targetRel = targetMap.get(tab.rId) || `worksheets/sheet${tab.sheetId}.xml`;
    const targetPath = targetRel.startsWith('xl/') ? targetRel : `xl/${targetRel}`;
    const sheetXml = entries.get(targetPath)?.toString('utf-8');
    if (!sheetXml) continue;

    const rowMap = new Map<number, Map<number, SheetInspectCellMeta>>();
    const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || [];

    for (const rowXml of rowMatches) {
      const rNumMatch = rowXml.match(/r="(\d+)"/);
      if (!rNumMatch) continue;
      const rNum = parseInt(rNumMatch[1], 10);
      const cellsInRow = new Map<number, SheetInspectCellMeta>();

      const cMatches = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g) || [];
      for (const cXml of cMatches) {
        const rMatch = cXml.match(/r="([A-Z]+)(\d+)"/);
        if (!rMatch) continue;
        const colIdx = colRefToIndex0(rMatch[1]);
        const typeMatch = cXml.match(/t="([^"]+)"/);
        const cellType = typeMatch ? typeMatch[1] : '';

        const fMatch = cXml.match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
        const formula = fMatch ? `=${decodeXmlEntities(fMatch[1])}` : null;

        const vMatch = cXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const rawVal = vMatch ? decodeXmlEntities(vMatch[1]).trim() : '';

        let value: SheetCellScalar = null;
        let isBooleanCell = false;

        if (cellType === 'inlineStr') {
          const inlineParts: string[] = [];
          const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
          let tm: RegExpExecArray | null;
          while ((tm = tRegex.exec(cXml)) !== null) {
            inlineParts.push(decodeXmlEntities(tm[1]));
          }
          value = inlineParts.join('');
        } else if (cellType === 'b') {
          value = rawVal === '1' || rawVal.toLowerCase() === 'true';
          isBooleanCell = true;
        } else if (cellType === 's') {
          const sIdx = parseInt(rawVal, 10);
          value = Number.isFinite(sIdx) && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
        } else if (cellType === 'str') {
          value = rawVal;
        } else if (rawVal !== '') {
          const num = Number(rawVal);
          value = Number.isFinite(num) ? num : rawVal;
        }

        cellsInRow.set(colIdx, {
          value,
          formattedValue: value !== null ? String(value) : null,
          formula,
          isBooleanCell,
        });
      }
      rowMap.set(rNum, cellsInRow);
    }

    const maxRow = Math.max(0, ...Array.from(rowMap.keys()));
    const grid: SheetInspectCellMeta[][] = [];

    for (let r = 1; r <= maxRow; r++) {
      const rowCells = rowMap.get(r);
      if (!rowCells) {
        grid.push([]);
        continue;
      }
      const maxCol = Math.max(0, ...Array.from(rowCells.keys()));
      const rowArr: SheetInspectCellMeta[] = [];
      for (let c = 0; c <= maxCol; c++) {
        rowArr.push(rowCells.get(c) || { value: null });
      }
      grid.push(rowArr);
    }

    result.push({
      sheetId: tab.sheetId,
      sheetTitle: tab.name,
      rows: grid,
    });
  }

  return result;
}

export function parseLocalXlsxFixture(filePath: string): SheetTabInspectionInput[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return parseXlsxBuffer(fs.readFileSync(filePath));
}

