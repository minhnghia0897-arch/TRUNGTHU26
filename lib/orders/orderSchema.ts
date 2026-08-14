import type { OrderRow, OrderSource, Status, Carrier } from "@/lib/ordersMock";
import type { Cell } from "@/lib/google/sheets";
import type { Region, Currency } from "@/lib/types";

// ============================================================================
// Ánh xạ giữa một DÒNG trong Google Sheet và một OrderRow trong app.
//
// Mỗi dòng = một KIỆN (một người nhận, một kho, một vận đơn). Đơn nhiều người
// nhận sinh nhiều dòng, nối với nhau bằng cột "Mã đơn".
//
// Đọc theo TÊN CỘT chứ không theo vị trí: anh chèn thêm cột vào giữa cũng không
// làm lệch dữ liệu.
// ============================================================================

export const TAB_ORDERS = "Đơn hàng";
export const TAB_HISTORY = "Lịch sử";

/** Tên cột — thứ tự này chỉ dùng khi TẠO tab lần đầu. Sau đó đọc theo tên. */
export const COLUMNS = [
  "Khoá", // A — định danh bền, server sinh, không bao giờ đổi
  "Mã đơn",
  "Kiện",
  "Tổng kiện",
  "Mã CK",
  "Ngày tạo", // ISO-8601, hiển thị do client định dạng
  "Nguồn",
  "Trạng thái",
  "Kho", // vn | kr — nơi xuất hàng
  "Tiền tệ", // vnd | krw — tiền của các cột tiền dòng này (TÁCH khỏi Kho)
  "Tỉ giá", // snapshot lúc tạo đơn
  "Khách đặt",
  "SĐT",
  "Người nhận",
  "SĐT người nhận",
  "Địa chỉ",
  "ĐVVC",
  "Mã VC",
  "Sản phẩm",
  "Ngày muốn nhận",
  "Trả trước",
  "COD",
  "Cước VC",
  "Phí VC thu khách",
  "Nhãn",
  "Ghi chú",
  "NV",
  "Tiêu hao", // JSON map SKU → số lượng, để sau này trừ kho ở server
  "Đã trừ kho",
  "Sửa lúc",
  "Huỷ", // xoá mềm — giữ dấu vết đối soát
] as const;

export const HISTORY_COLUMNS = ["Thời gian", "Khoá", "Mã đơn", "Người", "Thay đổi"] as const;

export type ColumnName = (typeof COLUMNS)[number];

/** Vị trí thực tế của từng cột, đọc từ dòng tiêu đề của Sheet. */
export type HeaderMap = Partial<Record<ColumnName, number>>;

/** Các cột bắt buộc phải có — thiếu là dừng, không đoán mò rồi ghi nhầm cột. */
const REQUIRED: ColumnName[] = ["Khoá", "Mã đơn", "Trạng thái", "Kho", "Tiền tệ"];

export function buildHeaderMap(headerRow: Cell[]): HeaderMap {
  const map: HeaderMap = {};
  headerRow.forEach((cell, i) => {
    const name = String(cell ?? "").trim() as ColumnName;
    if (COLUMNS.includes(name) && map[name] === undefined) map[name] = i;
  });
  const missing = REQUIRED.filter((c) => map[c] === undefined);
  if (missing.length)
    throw new Error(
      `Sheet thiếu cột bắt buộc: ${missing.join(", ")}. ` +
        `Kiểm tra lại dòng tiêu đề của tab "${TAB_ORDERS}" — đừng đổi tên hay xoá các cột này.`,
    );
  return map;
}

// ------------------------------------------------------------------ helpers
const str = (v: Cell | undefined) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: Cell | undefined) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const bool = (v: Cell | undefined) => {
  const s = str(v).toLowerCase();
  return s === "true" || s === "x" || s === "1" || s === "có";
};

const asRegion = (v: string): Region => (v === "vn" ? "vn" : "kr");
const asCurrency = (v: string, fallback: Region): Currency =>
  v === "vnd" || v === "krw" ? v : fallback === "vn" ? "vnd" : "krw";
const asSource = (v: string): OrderSource =>
  v === "web" || v === "facebook" || v === "pos" ? v : "web";

/**
 * OrderRow.id phải là số (component dùng làm React key, Set chọn nhiều, id popup).
 * Sinh từ "Khoá" bằng hash 32-bit để ổn định giữa các lần tải — không lưu vào Sheet.
 */
export function idFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000_000;
}

/**
 * Tiền tệ của các cột tiền trên một dòng.
 *
 * QUAN TRỌNG: đừng suy tiền tệ từ `region` nữa — `region` là KHO GIAO. Người đặt
 * ở Hàn tặng quà về Việt Nam thì kho là VN nhưng tiền vẫn là ₩. Đơn mẫu cũ chưa
 * có cột này nên mới phải suy tạm từ kho.
 */
export const currencyOfRow = (r: OrderRow): Currency =>
  (r as SheetOrder).currency ?? (r.region === "vn" ? "vnd" : "krw");

export const fxOfRow = (r: OrderRow): number => (r as SheetOrder).fx || 18.5;

/** Quy một số tiền trên dòng về KRW để cộng gộp nhiều vùng. */
export const rowKrw = (v: number, r: OrderRow): number =>
  currencyOfRow(r) === "krw" ? v : v / fxOfRow(r);

/** Khoá dòng: bền, không tái sử dụng, không mang nghĩa nghiệp vụ. */
export function newRowKey(orderCode: string, parcelIndex: number): string {
  return `${orderCode}-${parcelIndex}`;
}

/** ISO → chuỗi hiển thị DD/MM/YYYY HH:mm mà bảng đơn đang dùng. */
export function displayTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ------------------------------------------------------- Sheet dòng → OrderRow
export interface SheetOrder extends OrderRow {
  rowKey: string;
  orderCode: string;
  parcelIndex: number;
  parcelCount: number;
  transferCode: string;
  currency: Currency;
  fx: number;
  recipientPhone: string;
  createdAtIso: string;
  updatedAtIso: string;
  voided: boolean;
}

export function rowToOrder(map: HeaderMap, cells: Cell[]): SheetOrder | null {
  const at = (c: ColumnName) => {
    const i = map[c];
    return i === undefined ? undefined : cells[i];
  };

  const rowKey = str(at("Khoá"));
  if (!rowKey) return null; // dòng trống hoặc anh gõ tay thiếu khoá → bỏ qua

  const region = asRegion(str(at("Kho")));
  const parcelIndex = num(at("Kiện")) || 1;
  const parcelCount = num(at("Tổng kiện")) || 1;

  let consume: Record<string, number> | undefined;
  const rawConsume = str(at("Tiêu hao"));
  if (rawConsume) {
    try {
      consume = JSON.parse(rawConsume) as Record<string, number>;
    } catch {
      consume = undefined; // anh sửa tay hỏng JSON — bỏ qua, không làm sập cả bảng
    }
  }

  const createdAtIso = str(at("Ngày tạo"));
  const tags = str(at("Nhãn"));

  return {
    id: idFromKey(rowKey),
    rowKey,
    orderCode: str(at("Mã đơn")),
    parcelIndex,
    parcelCount,
    transferCode: str(at("Mã CK")),
    source: asSource(str(at("Nguồn"))),
    status: (str(at("Trạng thái")) || "Mới") as Status,
    region,
    currency: asCurrency(str(at("Tiền tệ")), region),
    fx: num(at("Tỉ giá")) || 18.5,
    customer: str(at("Khách đặt")),
    phone: str(at("SĐT")),
    recipient: str(at("Người nhận")),
    recipientPhone: str(at("SĐT người nhận")),
    address: str(at("Địa chỉ")),
    carrier: str(at("ĐVVC")) as Carrier,
    vc: str(at("Mã VC")),
    product: str(at("Sản phẩm")) || undefined,
    expected: str(at("Ngày muốn nhận")) || undefined,
    prepaid: num(at("Trả trước")),
    cod: num(at("COD")),
    cuoc_vc: num(at("Cước VC")),
    phi_vc_thu_khach: num(at("Phí VC thu khách")),
    tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    note: str(at("Ghi chú")),
    assignee: str(at("NV")) || undefined,
    consume,
    stockApplied: bool(at("Đã trừ kho")),
    created: displayTime(createdAtIso),
    createdAtIso,
    updatedAtIso: str(at("Sửa lúc")),
    voided: bool(at("Huỷ")),
  };
}

// ------------------------------------------------------- OrderRow → Sheet dòng
/** Dựng mảng ô theo đúng vị trí cột thật của Sheet (dựa vào HeaderMap). */
export function orderToCells(map: HeaderMap, o: SheetOrder, width: number): Cell[] {
  const cells: Cell[] = new Array(width).fill("");
  const put = (c: ColumnName, v: Cell) => {
    const i = map[c];
    if (i !== undefined && i < width) cells[i] = v;
  };

  put("Khoá", o.rowKey);
  put("Mã đơn", o.orderCode);
  put("Kiện", o.parcelIndex);
  put("Tổng kiện", o.parcelCount);
  put("Mã CK", o.transferCode);
  put("Ngày tạo", o.createdAtIso);
  put("Nguồn", o.source);
  put("Trạng thái", o.status);
  put("Kho", o.region);
  put("Tiền tệ", o.currency);
  put("Tỉ giá", o.fx);
  put("Khách đặt", o.customer);
  put("SĐT", o.phone);
  put("Người nhận", o.recipient);
  put("SĐT người nhận", o.recipientPhone);
  put("Địa chỉ", o.address);
  put("ĐVVC", o.carrier);
  put("Mã VC", o.vc);
  put("Sản phẩm", o.product ?? "");
  put("Ngày muốn nhận", o.expected ?? "");
  put("Trả trước", o.prepaid);
  put("COD", o.cod);
  put("Cước VC", o.cuoc_vc);
  put("Phí VC thu khách", o.phi_vc_thu_khach);
  put("Nhãn", o.tags.join(", "));
  put("Ghi chú", o.note);
  put("NV", o.assignee ?? "");
  put("Tiêu hao", o.consume ? JSON.stringify(o.consume) : "");
  put("Đã trừ kho", o.stockApplied ? "TRUE" : "FALSE");
  put("Sửa lúc", o.updatedAtIso);
  put("Huỷ", o.voided ? "TRUE" : "FALSE");

  return cells;
}
