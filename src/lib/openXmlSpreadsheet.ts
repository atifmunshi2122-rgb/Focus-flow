/**
 * FocusFlow & Finance — High-Performance Zero-Dependency OpenXML XLSX Builder
 * Generates genuine multi-sheet .xlsx workbooks with styled headers, custom column widths,
 * frozen panes, and cell number formats with 100% native compatibility for Excel, Numbers, and Google Sheets.
 */

export type ColumnFormatType = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'integer';

export interface WorksheetColumn {
  header: string;
  key: string;
  width?: number;
  format?: ColumnFormatType;
  headerStyle?: 'navy' | 'purple';
}

export interface WorksheetData {
  name: string;
  columns: WorksheetColumn[];
  rows: Array<Record<string, unknown>>;
  freezeHeader?: boolean;
  autoFilter?: boolean;
}

// Precomputed CRC32 table for fast checksumming
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function computeCrc32(data: Uint8Array): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const textEncoder = new TextEncoder();

function stringToUtf8(str: string): Uint8Array {
  return textEncoder.encode(str);
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Packs files into a standard PKZIP 2.0 archive using STORE (uncompressed) method.
 * Guaranteed to be valid for all standard decompression utilities.
 */
function packZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = stringToUtf8(entry.name);
    const dataBytes = entry.data;
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes)
    const lh = new Uint8Array(30);
    const lhView = new DataView(lh.buffer);
    lhView.setUint32(0, 0x04034b50, true); // Local header signature
    lhView.setUint16(4, 20, true);         // Version needed: 2.0
    lhView.setUint16(6, 0x0800, true);     // General purpose bit flag: UTF-8
    lhView.setUint16(8, 0, true);          // Compression method: 0 (Store)
    lhView.setUint16(10, 0, true);         // Mod time
    lhView.setUint16(12, 0, true);         // Mod date
    lhView.setUint32(14, crc, true);       // CRC-32
    lhView.setUint32(18, size, true);      // Compressed size
    lhView.setUint32(22, size, true);      // Uncompressed size
    lhView.setUint16(26, nameBytes.length, true); // File name length
    lhView.setUint16(28, 0, true);         // Extra field length

    localChunks.push(lh, nameBytes, dataBytes);

    // Central directory header (46 bytes)
    const ch = new Uint8Array(46);
    const chView = new DataView(ch.buffer);
    chView.setUint32(0, 0x02014b50, true); // Central directory signature
    chView.setUint16(4, 20, true);         // Version made by
    chView.setUint16(6, 20, true);         // Version needed
    chView.setUint16(8, 0x0800, true);     // UTF-8 flag
    chView.setUint16(10, 0, true);         // Compression: Store
    chView.setUint16(12, 0, true);         // Mod time
    chView.setUint16(14, 0, true);         // Mod date
    chView.setUint32(16, crc, true);       // CRC-32
    chView.setUint32(20, size, true);      // Compressed size
    chView.setUint32(24, size, true);      // Uncompressed size
    chView.setUint16(28, nameBytes.length, true); // File name length
    chView.setUint16(30, 0, true);         // Extra field length
    chView.setUint16(32, 0, true);         // Comment length
    chView.setUint16(34, 0, true);         // Disk number start
    chView.setUint16(36, 0, true);         // Internal attributes
    chView.setUint32(38, 0, true);         // External attributes
    chView.setUint32(42, offset, true);    // Relative offset of local header

    centralChunks.push(ch, nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const c of centralChunks) {
    centralSize += c.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true);          // Disk number
  eocdView.setUint16(6, 0, true);          // Start disk
  eocdView.setUint16(8, entries.length, true);  // Number of records on this disk
  eocdView.setUint16(10, entries.length, true); // Total central directory records
  eocdView.setUint32(12, centralSize, true);    // Size of central directory
  eocdView.setUint32(16, centralOffset, true); // Offset of central directory
  eocdView.setUint16(20, 0, true);         // Comment length

  const totalLength = offset + centralSize + 22;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of localChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  out.set(eocd, pos);

  return out;
}

function colToLetter(colIndex: number): string {
  let temp = colIndex + 1;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

function escapeXml(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(name: string): string {
  // Excel limits sheet names to 31 chars and disallows: \ / ? * : [ ]
  const cleaned = name.replace(/[\\/?*:[\]]/g, ' ').trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

/**
 * Builds standard OpenXML shared styles:
 * s="0": standard body text
 * s="1": bold header with dark navy fill & white text (#0F172A)
 * s="2": number/currency formatted (2 decimal places: #,##0.00)
 * s="3": percent formatted (1 decimal place: 0.0%)
 * s="4": bold summary row with top/bottom double borders
 * s="5": purple accent header (#7C3AED fill, white text)
 * s="6": integer count formatted (#,##0)
 * s="7": date formatted (yyyy-mm-dd)
 * s="8": lavender accent badge (purple text on #F5F3FF)
 * s="9": positive cashflow badge (green text on #DCFCE7)
 * s="10": negative cashflow badge (red text on #FEE2E2)
 * s="11": section header row (#F1F5F9 fill, bold navy text)
 */
function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="4">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
    <numFmt numFmtId="165" formatCode="0.0%"/>
    <numFmt numFmtId="166" formatCode="#,##0"/>
    <numFmt numFmtId="167" formatCode="yyyy-mm-dd"/>
  </numFmts>
  <fonts count="7">
    <font><sz val="10"/><name val="Calibri"/></font>                                    <!-- 0: Regular 10pt -->
    <font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>        <!-- 1: Bold White 10.5pt -->
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>        <!-- 2: Bold Navy 10pt -->
    <font><b/><sz val="13"/><color rgb="FF0F172A"/><name val="Calibri"/></font>        <!-- 3: Title 13pt -->
    <font><b/><sz val="9.5"/><color rgb="FF6D28D9"/><name val="Calibri"/></font>       <!-- 4: Purple 9.5pt -->
    <font><b/><sz val="9.5"/><color rgb="FF15803D"/><name val="Calibri"/></font>       <!-- 5: Green 9.5pt -->
    <font><b/><sz val="9.5"/><color rgb="FFB91C1C"/><name val="Calibri"/></font>       <!-- 6: Red 9.5pt -->
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>                                     <!-- 0: none -->
    <fill><patternFill patternType="gray125"/></fill>                                  <!-- 1: gray125 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill> <!-- 2: dark navy -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF7C3AED"/><bgColor indexed="64"/></patternFill></fill> <!-- 3: electric purple -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF5F3FF"/><bgColor indexed="64"/></patternFill></fill> <!-- 4: soft lavender -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill> <!-- 5: soft green -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill> <!-- 6: soft red -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill> <!-- 7: light slate -->
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FF94A3B8"/></top>
      <bottom style="double"><color rgb="FF0F172A"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>                              <!-- 0: text -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>  <!-- 1: navy header -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>     <!-- 2: currency #,##0.00 -->
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>     <!-- 3: percent 0.0% -->
    <xf numFmtId="164" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"/> <!-- 4: summary double-border -->
    <xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>  <!-- 5: purple header -->
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>     <!-- 6: integer #,##0 -->
    <xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>     <!-- 7: date yyyy-mm-dd -->
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1"/>  <!-- 8: lavender badge -->
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1"/>  <!-- 9: green badge -->
    <xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1"/>  <!-- 10: red badge -->
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1"/>  <!-- 11: section header -->
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

function buildWorksheetXml(sheet: WorksheetData, isFirstSheet: boolean = false): string {
  const { columns, rows, freezeHeader = true, autoFilter = true } = sheet;

  // Calculate dynamic column widths based on contents
  const colWidths: number[] = columns.map((col) => {
    let maxLen = col.header.length;
    for (const r of rows) {
      const val = r[col.key];
      if (val !== undefined && val !== null) {
        const len = String(val).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return Math.max(12, Math.min(48, maxLen + 3));
  });

  const colsXml = colWidths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  // Dimensions
  const lastColLetter = colToLetter(Math.max(0, columns.length - 1));
  const totalRowCount = Math.max(1, rows.length + 1);
  const dimensionXml = `<dimension ref="A1:${lastColLetter}${totalRowCount}"/>`;

  // Frozen header pane definition
  const tabAttr = isFirstSheet ? ' tabSelected="1"' : '';
  const viewsXml = freezeHeader
    ? `<sheetViews>
        <sheetView${tabAttr} workbookViewId="0">
          <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
        </sheetView>
      </sheetViews>`
    : `<sheetViews><sheetView${tabAttr} workbookViewId="0"/></sheetViews>`;

  // Build Header Row (row 1)
  const headerCells = columns
    .map((col, cIdx) => {
      const ref = `${colToLetter(cIdx)}1`;
      const styleId = col.headerStyle === 'purple' ? '5' : '1';
      return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(col.header)}</t></is></c>`;
    })
    .join('');
  const headerRowXml = `<row r="1">${headerCells}</row>`;

  // Build Data Rows (row 2..N)
  const dataRowsXml = rows
    .map((row, rIdx) => {
      const rowNum = rIdx + 2;
      const isSummary = Boolean(row._isSummary);
      const isSection = Boolean(row._isSection);
      const rowAccent = row._accent as string | undefined;

      const cells = columns
        .map((col, cIdx) => {
          const ref = `${colToLetter(cIdx)}${rowNum}`;
          const rawVal = row[col.key];
          const fmt = col.format || 'text';

          if (rawVal === null || rawVal === undefined || rawVal === '') {
            return `<c r="${ref}" s="${isSection ? '11' : '0'}"/>`;
          }

          if (isSection) {
            return `<c r="${ref}" s="11" t="inlineStr"><is><t>${escapeXml(rawVal)}</t></is></c>`;
          }

          if (isSummary) {
            const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
            if (!isNaN(num) && (fmt === 'number' || fmt === 'currency')) {
              return `<c r="${ref}" s="4"><v>${num}</v></c>`;
            }
            return `<c r="${ref}" s="4" t="inlineStr"><is><t>${escapeXml(rawVal)}</t></is></c>`;
          }

          if (rowAccent === 'green') {
            return `<c r="${ref}" s="9" t="inlineStr"><is><t>${escapeXml(rawVal)}</t></is></c>`;
          }
          if (rowAccent === 'red') {
            return `<c r="${ref}" s="10" t="inlineStr"><is><t>${escapeXml(rawVal)}</t></is></c>`;
          }
          if (rowAccent === 'lavender') {
            return `<c r="${ref}" s="8" t="inlineStr"><is><t>${escapeXml(rawVal)}</t></is></c>`;
          }

          if (fmt === 'number' || fmt === 'currency') {
            const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
            if (!isNaN(num)) {
              return `<c r="${ref}" s="2"><v>${num}</v></c>`;
            }
          }

          if (fmt === 'integer') {
            const num = typeof rawVal === 'number' ? Math.round(rawVal) : parseInt(String(rawVal), 10);
            if (!isNaN(num)) {
              return `<c r="${ref}" s="6"><v>${num}</v></c>`;
            }
          }

          if (fmt === 'percent') {
            const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
            if (!isNaN(num)) {
              return `<c r="${ref}" s="3"><v>${num}</v></c>`;
            }
          }

          if (fmt === 'date') {
            return `<c r="${ref}" s="7" t="inlineStr"><is><t>${escapeXml(rawVal)}</t></is></c>`;
          }

          // Default text string cell
          return `<c r="${ref}" s="0" t="inlineStr"><is><t>${escapeXml(rawVal)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNum}">${cells}</row>`;
    })
    .join('');

  const autoFilterXml =
    autoFilter && rows.length > 0 && columns.length > 0
      ? `<autoFilter ref="A1:${lastColLetter}${rows.length + 1}"/>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${dimensionXml}
  ${viewsXml}
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>
    ${headerRowXml}
    ${dataRowsXml}
  </sheetData>
  ${autoFilterXml}
</worksheet>`;
}

/**
 * Builds a genuine OpenXML .xlsx workbook byte array from multiple worksheets.
 */
export function generateOpenXmlWorkbook(sheets: WorksheetData[]): Uint8Array {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: 'Data', columns: [{ header: 'Note', key: 'note' }], rows: [{ note: 'No data' }] }];
  const entries: ZipEntry[] = [];

  // 1. [Content_Types].xml
  const sheetOverrides = safeSheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('\n  ');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;
  entries.push({ name: '[Content_Types].xml', data: stringToUtf8(contentTypesXml) });

  // 2. _rels/.rels
  const globalRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  entries.push({ name: '_rels/.rels', data: stringToUtf8(globalRelsXml) });

  // 3. xl/_rels/workbook.xml.rels
  const sheetRelationships = safeSheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('\n  ');

  const stylesRelId = `rId${safeSheets.length + 1}`;
  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelationships}
  <Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  entries.push({ name: 'xl/_rels/workbook.xml.rels', data: stringToUtf8(wbRelsXml) });

  // 4. xl/workbook.xml
  const sheetsXml = safeSheets
    .map((s, i) => `<sheet name="${escapeXml(sanitizeSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('\n    ');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetsXml}
  </sheets>
</workbook>`;
  entries.push({ name: 'xl/workbook.xml', data: stringToUtf8(workbookXml) });

  // 5. xl/styles.xml
  entries.push({ name: 'xl/styles.xml', data: stringToUtf8(buildStylesXml()) });

  // 6. xl/worksheets/sheet{i+1}.xml
  safeSheets.forEach((s, idx) => {
    entries.push({
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      data: stringToUtf8(buildWorksheetXml(s, idx === 0)),
    });
  });

  return packZip(entries);
}

/**
 * Initiates an automatic browser download of an .xlsx file.
 */
export function downloadXlsxFile(filename: string, sheets: WorksheetData[]): void {
  const zipBytes = generateOpenXmlWorkbook(sheets);
  const blob = new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ZipFileEntry {
  name: string;
  content: string | Uint8Array;
}

/**
 * Builds a valid zero-dependency PKZIP archive from text or binary entries.
 */
export function generateZipArchive(files: ZipFileEntry[]): Uint8Array {
  const seen = new Set<string>();
  const entries: ZipEntry[] = files.map((f) => {
    let name = f.name;
    if (seen.has(name)) {
      let counter = 2;
      const dotIndex = name.lastIndexOf('.');
      const baseName = dotIndex !== -1 ? name.slice(0, dotIndex) : name;
      const ext = dotIndex !== -1 ? name.slice(dotIndex) : '';
      while (seen.has(`${baseName}-${counter}${ext}`)) {
        counter++;
      }
      name = `${baseName}-${counter}${ext}`;
    }
    seen.add(name);
    return {
      name,
      data: typeof f.content === 'string' ? stringToUtf8(f.content) : f.content,
    };
  });
  return packZip(entries);
}

/**
 * Initiates an automatic browser download of a .zip archive.
 */
export function downloadZipFile(filename: string, files: ZipFileEntry[]): void {
  const zipBytes = generateZipArchive(files);
  const blob = new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/zip',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.zip') ? filename : `${filename}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
