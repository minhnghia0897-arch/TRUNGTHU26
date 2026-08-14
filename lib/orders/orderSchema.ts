import type { OrderRow, OrderSource, Status, Carrier } from "@/lib/ordersMock";
import type { Region, Currency } from "@/lib/types";

// ============================================================================
// Kiểu dữ liệu chung cho một KIỆN đơn hàng.
//
// Một kiện = một người nhận = một kho = một vận đơn = một bản ghi `shipment`
// trong Supabase. Đơn nhiều người nhận sinh nhiều kiện, nối với nhau bằng
// `orderCode` (mã đơn trên bảng `web_order`).
// ============================================================================

/** Giá trị thô đọc lên từ DB. */
export type Cell = string | number | boolean | null | undefined;

const str = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: Cell) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const asRegion = (v: string): Region => (v === "vn" ? "vn" : "kr");
export const asCurrency = (v: string, fallback: Region): Currency =>
  v === "vnd" || v === "krw" ? v : fallback === "vn" ? "vnd" : "krw";
export const asSource = (v: string): OrderSource =>
  v === "web" || v === "facebook" || v === "pos" ? v : "web";

/**
 * OrderRow.id phải là số (component dùng làm React key, Set chọn nhiều, id popup)
 * nhưng khoá thật trong DB là uuid. Băm uuid thành số 32-bit, ổn định giữa các
 * lần tải nên chọn dòng / mở popup không bị nhảy.
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
 * QUAN TRỌNG: đừng suy tiền tệ từ `region` — `region` là KHO GIAO. Người đặt ở
 * Hàn tặng quà về Việt Nam thì kho là VN nhưng tiền vẫn là ₩ (§5: một đơn một
 * tiền tệ, theo vùng người đặt). Đơn mẫu cũ chưa có trường này nên mới phải suy
 * tạm từ kho.
 */
export const currencyOfRow = (r: OrderRow): Currency =>
  (r as StoredOrder).currency ?? (r.region === "vn" ? "vnd" : "krw");

export const fxOfRow = (r: OrderRow): number => (r as StoredOrder).fx || 18.5;

/** Quy một số tiền trên dòng về KRW để cộng gộp nhiều vùng. */
export const rowKrw = (v: number, r: OrderRow): number =>
  currencyOfRow(r) === "krw" ? v : v / fxOfRow(r);

/** ISO → chuỗi hiển thị DD/MM/YYYY HH:mm mà bảng đơn đang dùng. */
export function displayTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// --------------------------------------------------------------- StoredOrder
/**
 * `rowKey` = `shipment.id` (uuid). Dùng uuid làm định danh thay vì ghép
 * `mã đơn + số kiện`: không bao giờ trùng, không đổi khi sửa đơn, và tìm đúng
 * bản ghi bằng một truy vấn khoá chính.
 */
export interface StoredOrder extends OrderRow {
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

// ------------------------------------------------- bản ghi DB → StoredOrder
/** Hình dạng một dòng `shipment` kèm quan hệ, đúng như câu select ở orderStore. */
export interface ShipmentRow {
  id: string;
  fulfillment_region: string;
  vc_code: Cell;
  carrier: Cell;
  status: Cell;
  cod: Cell;
  prepaid: Cell;
  cuoc_vc: Cell;
  phi_vc_thu_khach: Cell;
  tags: unknown;
  note: Cell;
  source: Cell;
  assignee: Cell;
  product_summary: Cell;
  consume: unknown;
  stock_applied: Cell;
  voided: Cell;
  parcel_index: Cell;
  parcel_count: Cell;
  updated_at: Cell;
  web_order: {
    code: Cell;
    transfer_code: Cell;
    currency: Cell;
    fx_rate_snapshot: Cell;
    created_at: Cell;
    customer: { name: Cell; phone: Cell } | null;
  } | null;
  recipient: {
    name: Cell;
    phone: Cell;
    address: Cell;
    desired_date: Cell;
  } | null;
}

export function rowToOrder(s: ShipmentRow): StoredOrder {
  const region = asRegion(str(s.fulfillment_region));
  const wo = s.web_order;
  const rc = s.recipient;
  const createdAtIso = str(wo?.created_at);

  const tags = Array.isArray(s.tags) ? (s.tags as unknown[]).map((t) => str(t as Cell)) : [];
  const consume =
    s.consume && typeof s.consume === "object" && !Array.isArray(s.consume)
      ? (s.consume as Record<string, number>)
      : undefined;

  return {
    id: idFromKey(s.id),
    rowKey: s.id,
    orderCode: str(wo?.code),
    parcelIndex: num(s.parcel_index) || 1,
    parcelCount: num(s.parcel_count) || 1,
    transferCode: str(wo?.transfer_code),
    source: asSource(str(s.source)),
    status: (str(s.status) || "Mới") as Status,
    region,
    currency: asCurrency(str(wo?.currency), region),
    fx: num(wo?.fx_rate_snapshot) || 18.5,
    customer: str(wo?.customer?.name),
    phone: str(wo?.customer?.phone),
    recipient: str(rc?.name),
    recipientPhone: str(rc?.phone),
    address: str(rc?.address),
    carrier: str(s.carrier) as Carrier,
    vc: str(s.vc_code),
    product: str(s.product_summary) || undefined,
    expected: str(rc?.desired_date) || undefined,
    prepaid: num(s.prepaid),
    cod: num(s.cod),
    cuoc_vc: num(s.cuoc_vc),
    phi_vc_thu_khach: num(s.phi_vc_thu_khach),
    tags: tags.filter(Boolean),
    note: str(s.note),
    assignee: str(s.assignee) || undefined,
    consume,
    stockApplied: s.stock_applied === true,
    created: displayTime(createdAtIso),
    createdAtIso,
    updatedAtIso: str(s.updated_at),
    voided: s.voided === true,
  };
}

/**
 * Câu select dùng chung cho mọi chỗ đọc kiện — giữ một nơi để khỏi lệch nhau.
 *
 * Nhúng bằng TÊN BẢNG được vì giữa mỗi cặp bảng chỉ có đúng một khoá ngoại
 * (shipment→web_order, shipment→recipient, web_order→customer), không nhập nhằng.
 */
export const SHIPMENT_SELECT = `
  id, fulfillment_region, vc_code, carrier, status, cod, prepaid, cuoc_vc,
  phi_vc_thu_khach, tags, note, source, assignee, product_summary, consume,
  stock_applied, voided, parcel_index, parcel_count, updated_at,
  web_order ( code, transfer_code, currency, fx_rate_snapshot, created_at,
              customer ( name, phone ) ),
  recipient ( name, phone, address, desired_date )
`;
