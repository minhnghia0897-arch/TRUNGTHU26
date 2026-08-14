import {
  a1,
  appendValues,
  batchGetValues,
  batchUpdateValues,
  colName,
  ensureTab,
  getValues,
  isSheetsConfigured,
  type Cell,
} from "@/lib/google/sheets";
import {
  COLUMNS,
  HISTORY_COLUMNS,
  TAB_HISTORY,
  TAB_ORDERS,
  buildHeaderMap,
  displayTime,
  newRowKey,
  orderToCells,
  rowToOrder,
  type HeaderMap,
  type SheetOrder,
} from "./orderSchema";
import { ORDERS } from "@/lib/ordersMock";

// ============================================================================
// Kho đơn đặt trên Google Sheet — module DUY NHẤT mà app nói chuyện cùng.
// CHỈ CHẠY Ở SERVER.
//
// Nguyên tắc quan trọng: chỉ lùi về dữ liệu mẫu khi CHƯA CẤU HÌNH.
// Nếu đã cấu hình mà Sheet lỗi thì phải BÁO LỖI — tuyệt đối không hiện 18 đơn
// mẫu trông như thật, vì anh sẽ tưởng không có đơn nào và bỏ sót khách.
// ============================================================================

export const isOrderStoreConfigured = () => isSheetsConfigured();

export interface HistoryRow {
  at: string;
  rowKey: string;
  orderCode: string;
  by: string;
  changes: string[];
}

export interface OrderStoreData {
  rows: SheetOrder[];
  history: HistoryRow[];
  source: "sheet" | "seed";
}

// ---------------------------------------------------------------- ensureTabs
// Chạy một lần cho mỗi instance server. Giữ promise để nhiều request đồng thời
// không cùng tạo tab.
let tabsReady: Promise<void> | null = null;

function ensureTabs(): Promise<void> {
  if (!tabsReady) {
    tabsReady = (async () => {
      await ensureTab(TAB_ORDERS, [...COLUMNS]);
      await ensureTab(TAB_HISTORY, [...HISTORY_COLUMNS]);
    })().catch((e) => {
      tabsReady = null; // lỗi thì lần sau thử lại
      throw e;
    });
  }
  return tabsReady;
}

const ORDERS_RANGE = a1(TAB_ORDERS, `A:${colName(COLUMNS.length + 10)}`);
const HISTORY_RANGE = a1(TAB_HISTORY, "A:E");

/** Đọc tiêu đề + toàn bộ dòng. Trả về map cột để dùng lại khi ghi. */
async function readAll(): Promise<{ map: HeaderMap; width: number; rows: SheetOrder[] }> {
  const [values] = await batchGetValues([ORDERS_RANGE]);
  if (!values.length) return { map: buildHeaderMap([...COLUMNS]), width: COLUMNS.length, rows: [] };

  const header = values[0] ?? [];
  const map = buildHeaderMap(header);
  const width = Math.max(header.length, COLUMNS.length);

  const rows = values
    .slice(1)
    .map((cells) => rowToOrder(map, cells))
    .filter((o): o is SheetOrder => o !== null);

  return { map, width, rows };
}

// ------------------------------------------------------------------ listOrders
export async function listOrders(): Promise<OrderStoreData> {
  if (!isOrderStoreConfigured()) {
    // Chưa nối Sheet → dữ liệu mẫu để xem giao diện. KHÔNG phải trạng thái lỗi.
    return { rows: ORDERS as SheetOrder[], history: [], source: "seed" };
  }

  await ensureTabs();
  const [orderValues, historyValues] = await batchGetValues([ORDERS_RANGE, HISTORY_RANGE]);

  const header = orderValues[0] ?? [];
  const map = buildHeaderMap(header.length ? header : [...COLUMNS]);
  const rows = orderValues
    .slice(1)
    .map((cells) => rowToOrder(map, cells))
    .filter((o): o is SheetOrder => o !== null)
    .filter((o) => !o.voided)
    .reverse(); // đơn mới nhất lên đầu, giống bảng đang hiển thị

  const history: HistoryRow[] = historyValues.slice(1).flatMap((c) => {
    const at = String(c[0] ?? "").trim();
    const rowKey = String(c[1] ?? "").trim();
    if (!rowKey) return [];
    return [
      {
        at,
        rowKey,
        orderCode: String(c[2] ?? "").trim(),
        by: String(c[3] ?? "").trim() || "Hệ thống",
        changes: String(c[4] ?? "")
          .split(" · ")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    ];
  });

  return { rows, history, source: "sheet" };
}

// ---------------------------------------------------------------- appendOrders
/** Dữ liệu tối thiểu để dựng một dòng kiện. */
export type NewParcel = Omit<
  SheetOrder,
  "id" | "rowKey" | "created" | "createdAtIso" | "updatedAtIso" | "voided"
>;

/**
 * Ghi tất cả kiện của MỘT đơn trong MỘT request append.
 * Append là thao tác atomic phía Google: hai khách đặt cùng lúc không đè nhau,
 * và các kiện của cùng một đơn luôn nằm liền nhau.
 */
export async function appendOrders(parcels: NewParcel[]): Promise<{ rowKeys: string[] }> {
  if (!parcels.length) return { rowKeys: [] };
  if (!isOrderStoreConfigured()) {
    return { rowKeys: parcels.map((p) => newRowKey(p.orderCode, p.parcelIndex)) };
  }

  await ensureTabs();
  const header = await getValues(a1(TAB_ORDERS, "1:1"));
  const map = buildHeaderMap(header[0] ?? [...COLUMNS]);
  const width = Math.max((header[0] ?? []).length, COLUMNS.length);

  const now = new Date().toISOString();
  const full: SheetOrder[] = parcels.map((p) => ({
    ...p,
    id: 0,
    rowKey: newRowKey(p.orderCode, p.parcelIndex),
    created: displayTime(now),
    createdAtIso: now,
    updatedAtIso: now,
    voided: false,
  }));

  await appendValues(ORDERS_RANGE, full.map((o) => orderToCells(map, o, width)));
  await appendHistory(
    full.map((o) => ({
      rowKey: o.rowKey,
      orderCode: o.orderCode,
      by: "Khách đặt web",
      changes: ["Tạo đơn từ website"],
    })),
  );

  return { rowKeys: full.map((o) => o.rowKey) };
}

/** Đơn đã có trên Sheet chưa? Dùng để chống ghi trùng khi client bấm 2 lần. */
export async function orderCodeExists(orderCode: string): Promise<boolean> {
  if (!isOrderStoreConfigured() || !orderCode) return false;
  const { rows } = await readAll();
  return rows.some((r) => r.orderCode === orderCode);
}

// ---------------------------------------------------------------- updateOrder
/** Tìm số dòng thật của một Khoá. Đọc lại ngay trước khi ghi để chịu được
 *  việc anh tự sắp xếp / chèn / xoá dòng trong Sheet. */
async function findRowNumber(rowKey: string, map: HeaderMap): Promise<number> {
  const keyCol = map["Khoá"] ?? 0;
  const letter = colName(keyCol + 1);
  const col = await getValues(a1(TAB_ORDERS, `${letter}:${letter}`));
  for (let i = 1; i < col.length; i += 1) {
    if (String(col[i]?.[0] ?? "").trim() === rowKey) return i + 1; // 1-indexed
  }
  return -1;
}

export interface UpdateResult {
  ok: boolean;
  error?: string;
  order?: SheetOrder;
}

export async function updateOrder(
  rowKey: string,
  patch: Partial<SheetOrder>,
  actor = "Bạn",
  changes: string[] = [],
): Promise<UpdateResult> {
  if (!isOrderStoreConfigured()) return { ok: true }; // chế độ xem thử

  await ensureTabs();
  const { map, width, rows } = await readAll();
  const current = rows.find((r) => r.rowKey === rowKey);
  if (!current) return { ok: false, error: `Không tìm thấy đơn ${rowKey} trên Sheet.` };

  const rowNumber = await findRowNumber(rowKey, map);
  if (rowNumber < 0) return { ok: false, error: `Không tìm thấy dòng của đơn ${rowKey}.` };

  const merged: SheetOrder = {
    ...current,
    ...patch,
    rowKey: current.rowKey, // khoá không bao giờ đổi
    updatedAtIso: new Date().toISOString(),
  };

  await batchUpdateValues([
    {
      range: a1(TAB_ORDERS, `A${rowNumber}:${colName(width)}${rowNumber}`),
      values: [orderToCells(map, merged, width)],
    },
  ]);

  // Ghi xong đọc lại đúng ô khoá — nếu lệch nghĩa là có người chèn/xoá dòng
  // xen giữa lúc mình đọc và lúc mình ghi.
  const check = await getValues(
    a1(TAB_ORDERS, `${colName((map["Khoá"] ?? 0) + 1)}${rowNumber}`),
  );
  if (String(check[0]?.[0] ?? "").trim() !== rowKey) {
    return {
      ok: false,
      error: "Sheet vừa bị thay đổi trong lúc lưu. Tải lại trang rồi sửa lại giúp em.",
    };
  }

  if (changes.length) await appendHistory([{ rowKey, orderCode: merged.orderCode, by: actor, changes }]);
  return { ok: true, order: merged };
}

// ----------------------------------------------------------------- voidOrders
/** Xoá mềm: đánh dấu Huỷ = TRUE, giữ dòng lại để đối soát. */
export async function voidOrders(rowKeys: string[], actor = "Bạn"): Promise<UpdateResult> {
  if (!isOrderStoreConfigured()) return { ok: true };
  for (const key of rowKeys) {
    const r = await updateOrder(key, { status: "Huỷ đơn", voided: true }, actor, [
      "Xoá đơn khỏi bảng",
    ]);
    if (!r.ok) return r;
  }
  return { ok: true };
}

// --------------------------------------------------------------- appendHistory
/** Nhật ký thao tác. Lỗi ở đây KHÔNG được làm hỏng thao tác chính. */
export async function appendHistory(
  entries: { rowKey: string; orderCode: string; by: string; changes: string[] }[],
) {
  if (!isOrderStoreConfigured() || !entries.length) return;
  const at = new Date().toISOString();
  const values: Cell[][] = entries.map((e) => [
    at,
    e.rowKey,
    e.orderCode,
    e.by,
    e.changes.join(" · "),
  ]);
  try {
    await appendValues(HISTORY_RANGE, values);
  } catch (e) {
    console.error("SHEET_HISTORY_FAILED", e instanceof Error ? e.message : e);
  }
}
