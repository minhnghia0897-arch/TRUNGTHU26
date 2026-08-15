// ============================================================================
// Tạo file Excel (.xlsx) thật, không cần thư viện ngoài.
//
// .xlsx = một file ZIP chứa vài file XML (Office Open XML). Ở đây ZIP dùng
// phương thức STORE (không nén) nên không cần thư viện nén — file to hơn một
// chút nhưng Excel / Google Sheets / Numbers đều mở bình thường.
//
// Dùng ở client (cần Blob + TextEncoder).
// ============================================================================

export type CellValue = string | number | null | undefined;

export interface SheetColumn {
  header: string;
  width?: number; // độ rộng cột (đơn vị ký tự của Excel)
  money?: boolean; // định dạng số kiểu 1.234.567
}

export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: CellValue[][];
}

// ---------------------------------------------------------------- CRC32 (ZIP)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ ZIP writer
interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Gói các file thành một ZIP (STORE) — đủ chuẩn để Excel mở. */
function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // chữ ký local header
    lv.setUint16(4, 20, true); // version cần để giải nén
    lv.setUint16(6, 0x0800, true); // cờ: tên file mã hoá UTF-8
    lv.setUint16(8, 0, true); // method 0 = STORE
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra field
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // chữ ký central directory
    cv.setUint16(4, 20, true); // version tạo file
    cv.setUint16(6, 20, true); // version cần
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // đĩa bắt đầu
    cv.setUint16(36, 0, true); // thuộc tính nội bộ
    cv.setUint32(38, 0, true); // thuộc tính ngoài
    cv.setUint32(42, offset, true); // vị trí local header
    central.set(name, 46);

    locals.push(local, e.data);
    centrals.push(central);
    offset += local.length + size;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // chữ ký end of central directory
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // độ dài comment

  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

// ------------------------------------------------------------------- XLSX XML
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // ký tự điều khiển không hợp lệ trong XML → bỏ, tránh Excel báo file hỏng
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

/** Số cột → tên cột Excel (1 → A, 27 → AA). */
function colName(n: number): string {
  let s = "";
  let i = n;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/** Tên sheet Excel: tối đa 31 ký tự, không chứa : \ / ? * [ ] */
const sheetName = (s: string) => (s.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Sheet1");

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// style index: 0 = thường, 1 = tiêu đề, 2 = tiền (#,##0)
const STYLE_HEADER = 1;
const STYLE_MONEY = 2;

function stylesXml(): string {
  return (
    `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>` +
    `<fonts count="2">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="3">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

function cellXml(ref: string, v: CellValue, style: number): string {
  const s = style ? ` s="${style}"` : "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  const text = v == null ? "" : String(v);
  if (!text) return `<c r="${ref}"${s}/>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

function sheetXml(spec: SheetSpec): string {
  const nCols = spec.columns.length;
  const nRows = spec.rows.length + 1;

  const cols = spec.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join("");

  const header = spec.columns
    .map((c, i) => cellXml(`${colName(i + 1)}1`, c.header, STYLE_HEADER))
    .join("");

  const body = spec.rows
    .map((row, r) => {
      const cells = spec.columns
        .map((c, i) => {
          const v = row[i];
          const money = c.money && typeof v === "number";
          return cellXml(`${colName(i + 1)}${r + 2}`, v, money ? STYLE_MONEY : 0);
        })
        .join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");

  const lastRef = `${colName(Math.max(1, nCols))}${Math.max(1, nRows)}`;

  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}">` +
    `<dimension ref="A1:${lastRef}"/>` +
    // khoá dòng tiêu đề để cuộn vẫn thấy tên cột
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData><row r="1" ht="20" customHeight="1">${header}</row>${body}</sheetData>` +
    // bật bộ lọc sẵn trên dòng tiêu đề
    (nCols ? `<autoFilter ref="A1:${lastRef}"/>` : "") +
    `</worksheet>`
  );
}

/** Dựng file .xlsx từ danh sách sheet. Trả về Blob tải xuống / upload được. */
export function buildXlsx(sheets: SheetSpec[]): Blob {
  const list = sheets.length ? sheets : [{ name: "Sheet1", columns: [], rows: [] }];
  const enc = new TextEncoder();
  const file = (name: string, xml: string): ZipEntry => ({ name, data: enc.encode(xml) });

  const contentTypes =
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    list
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRels =
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
    list
      .map(
        (s, i) =>
          `<sheet name="${esc(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    list
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${list.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const entries: ZipEntry[] = [
    file("[Content_Types].xml", contentTypes),
    file("_rels/.rels", rootRels),
    file("xl/workbook.xml", workbook),
    file("xl/_rels/workbook.xml.rels", workbookRels),
    file("xl/styles.xml", stylesXml()),
    ...list.map((s, i) => file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s))),
  ];

  const bytes = zipStore(entries);
  return new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Tải Blob về máy dưới tên file cho trước. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
