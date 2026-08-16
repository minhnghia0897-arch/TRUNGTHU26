import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { adjustStock } from "@/lib/products/stock";
import { parseKey } from "@/lib/products/productStore";
import { RELEASED_STATUS, type Status } from "@/lib/ordersMock";
import { ORDERS } from "@/lib/ordersMock";
import {
  SHIPMENT_SELECT,
  rowToOrder,
  type ShipmentRow,
  type StoredOrder,
} from "./orderSchema";

// ============================================================================
// Kho đơn trên Supabase — module DUY NHẤT mà app nói chuyện cùng.
// CHỈ CHẠY Ở SERVER (dùng service role, bỏ qua RLS theo §4.3).
//
// Nguyên tắc quan trọng: chỉ lùi về dữ liệu mẫu khi CHƯA CẤU HÌNH.
// Nếu đã cấu hình mà DB lỗi thì phải BÁO LỖI — tuyệt đối không hiện 18 đơn mẫu
// trông như thật, vì anh sẽ tưởng không có khách nào đặt và bỏ sót đơn.
// ============================================================================

export const isOrderStoreConfigured = () => isServiceRoleConfigured;

export interface HistoryRow {
  at: string;
  rowKey: string;
  orderCode: string;
  by: string;
  changes: string[];
}

export interface OrderStoreData {
  rows: StoredOrder[];
  history: HistoryRow[];
  source: "db" | "seed";
}

const fail = (e: { message?: string } | null, what: string): never => {
  throw new Error(`${what}: ${e?.message ?? "lỗi không rõ"}`);
};

// ------------------------------------------------------------------ listOrders
export async function listOrders(): Promise<OrderStoreData> {
  if (!isOrderStoreConfigured()) {
    // Chưa nối DB → dữ liệu mẫu để xem giao diện. KHÔNG phải trạng thái lỗi.
    return { rows: ORDERS as StoredOrder[], history: [], source: "seed" };
  }

  const sb = getServiceClient();

  const { data, error } = await sb
    .from("shipment")
    .select(SHIPMENT_SELECT)
    .eq("voided", false)
    .limit(2000);
  if (error) fail(error, "Không đọc được đơn hàng");

  const rows = ((data ?? []) as unknown as ShipmentRow[])
    .map(rowToOrder)
    // đơn mới nhất lên đầu; cùng một đơn thì kiện 1 trước kiện 2
    .sort((a, b) =>
      a.createdAtIso === b.createdAtIso
        ? a.parcelIndex - b.parcelIndex
        : b.createdAtIso.localeCompare(a.createdAtIso),
    );

  const history = await listHistory(rows);
  return { rows, history, source: "db" };
}

/** Nhật ký thao tác của các kiện đang hiển thị. */
async function listHistory(rows: StoredOrder[]): Promise<HistoryRow[]> {
  if (!rows.length) return [];
  const sb = getServiceClient();
  const codeOf = new Map(rows.map((r) => [r.rowKey, r.orderCode]));

  const { data, error } = await sb
    .from("order_history")
    .select("shipment_id, at, actor, changes")
    .in("shipment_id", rows.map((r) => r.rowKey))
    .order("at", { ascending: false })
    .limit(4000);
  // Lịch sử hỏng không được làm sập cả bảng đơn — mất nhật ký còn hơn mất đơn.
  if (error) {
    console.error("ORDER_HISTORY_READ_FAILED", error.message);
    return [];
  }

  return (data ?? []).map((h) => {
    const row = h as { shipment_id: string; at: string; actor: string; changes: unknown };
    return {
      at: row.at,
      rowKey: row.shipment_id,
      orderCode: codeOf.get(row.shipment_id) ?? "",
      by: row.actor || "Hệ thống",
      changes: Array.isArray(row.changes) ? row.changes.map(String) : [],
    };
  });
}

// ---------------------------------------------------------------- appendOrders
/** Dữ liệu tối thiểu để dựng một kiện (đơn tạo tay ở bảng điều hành). */
export type NewParcel = Omit<
  StoredOrder,
  "id" | "rowKey" | "created" | "createdAtIso" | "updatedAtIso" | "voided"
>;

/**
 * Tạo đơn THỦ CÔNG từ bảng điều hành (nút "Tạo đơn").
 *
 * Đơn đặt từ website KHÔNG đi qua đây — `createOrder()` đã dựng đủ chuỗi
 * customer → web_order → recipient → order_line → shipment với giá chốt
 * server-side. Ở đây chỉ dựng chuỗi tối thiểu cho đơn nhập tay.
 */
export async function appendOrders(parcels: NewParcel[]): Promise<{ rowKeys: string[] }> {
  if (!parcels.length) return { rowKeys: [] };
  if (!isOrderStoreConfigured()) return { rowKeys: [] };

  const sb = getServiceClient();
  const first = parcels[0];

  // kho theo vùng của kiện đầu — đơn tạo tay chỉ có một kiện
  const { data: wh, error: whErr } = await sb
    .from("warehouse")
    .select("id, shipping_mode")
    .eq("region", first.region)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (whErr) fail(whErr, "Không đọc được kho");
  if (!wh) throw new Error(`Vùng "${first.region}" chưa có kho đang hoạt động.`);

  // Khách: gộp theo SĐT. Không có SĐT thì dựng khoá tạm để không đụng
  // ràng buộc unique của cột phone.
  const phone = first.phone?.trim() || `tay-${first.orderCode}`;
  const { data: cust, error: cErr } = await sb
    .from("customer")
    .upsert(
      { name: first.customer || "Khách lẻ", phone, region: first.region },
      { onConflict: "phone" },
    )
    .select("id")
    .single();
  if (cErr || !cust) fail(cErr, "Không tạo được khách");

  const total = parcels.reduce((s, p) => s + p.prepaid + p.cod, 0);
  const { data: order, error: oErr } = await sb
    .from("web_order")
    .insert({
      code: first.orderCode,
      customer_id: cust!.id,
      buyer_region: first.region,
      currency: first.currency,
      fx_rate_snapshot: first.fx || 18.5,
      subtotal: total,
      grand_total: total,
      payment_status: "pending",
      fulfillment_status: "draft",
      transfer_code: first.transferCode || first.orderCode,
    })
    .select("id")
    .single();
  if (oErr || !order) fail(oErr, "Không tạo được đơn");

  const rowKeys: string[] = [];
  for (const p of parcels) {
    const { data: rec, error: rErr } = await sb
      .from("recipient")
      .insert({
        web_order_id: order!.id,
        name: p.recipient || p.customer || "Khách lẻ",
        phone: p.recipientPhone || p.phone || "",
        address: p.address || "",
        region: p.region,
        desired_date: p.expected || null,
      })
      .select("id")
      .single();
    if (rErr || !rec) fail(rErr, "Không tạo được người nhận");

    const { data: ship, error: sErr } = await sb
      .from("shipment")
      .insert({
        web_order_id: order!.id,
        recipient_id: rec!.id,
        fulfillment_region: p.region,
        warehouse_id: wh!.id,
        shipping_mode: wh!.shipping_mode,
        idempotency_key: `${p.orderCode}-ship-${p.parcelIndex}`,
        parcel_index: p.parcelIndex,
        parcel_count: p.parcelCount,
        status: p.status,
        source: p.source,
        carrier: p.carrier || null,
        vc_code: p.vc || null,
        product_summary: p.product ?? null,
        prepaid: p.prepaid,
        cod: p.cod,
        cuoc_vc: p.cuoc_vc,
        phi_vc_thu_khach: p.phi_vc_thu_khach,
        tags: p.tags ?? [],
        note: p.note ?? "",
        assignee: p.assignee ?? null,
        // Tiền hàng và phí ship tách riêng (§0013) — không có thì popup chi tiết
        // phải suy ngược từ cách chia tiền, đúng cái lỗi đã sửa ở đó.
        goods_amount: p.goodsAmount ?? null,
        shipping_fee: p.shipFee ?? 0,
        consume: p.consume ?? null,
        stock_applied: false, // để syncStockForStatus bên dưới trừ, mới ghi đúng cờ
      })
      .select("id")
      .single();
    if (sErr || !ship) fail(sErr, "Không tạo được kiện");

    // Đơn mới ở trạng thái sống thì trừ kho ngay. Quan trọng với đơn nhân bản:
    // nó chép `consume` của đơn gốc nên có hàng thật để trừ.
    await syncStockForStatus(
      ship!.id,
      { status: p.status, consume: p.consume ?? null, stock_applied: false },
      p.status,
    );

    rowKeys.push(ship!.id);
  }

  await appendHistory(
    rowKeys.map((k) => ({
      rowKey: k,
      orderCode: first.orderCode,
      by: "Bạn",
      changes: ["Tạo đơn mới"],
    })),
  );

  return { rowKeys };
}

/** Đơn đã có trong DB chưa? Dùng để chống ghi trùng khi client bấm 2 lần. */
export async function orderCodeExists(orderCode: string): Promise<boolean> {
  if (!isOrderStoreConfigured() || !orderCode) return false;
  const sb = getServiceClient();
  const { data } = await sb.from("web_order").select("id").eq("code", orderCode).maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------- updateOrder
export interface UpdateResult {
  ok: boolean;
  error?: string;
  order?: StoredOrder;
}

/**
 * Sửa một kiện. Trường nào thuộc bảng nào thì ghi đúng bảng đó:
 *   shipment  — trạng thái, ĐVVC, mã VC, tiền, nhãn, ghi chú, NV, tiêu hao
 *   recipient — tên người nhận, địa chỉ, ngày muốn nhận
 *   customer  — tên và SĐT người đặt (dùng chung cho mọi đơn của khách đó)
 */
export async function updateOrder(
  rowKey: string,
  patch: Partial<StoredOrder>,
  actor = "Bạn",
  changes: string[] = [],
): Promise<UpdateResult> {
  if (!isOrderStoreConfigured()) return { ok: true }; // chế độ xem thử

  const sb = getServiceClient();

  const { data: existing, error: findErr } = await sb
    .from("shipment")
    .select("id, recipient_id, web_order_id, status, consume, stock_applied, web_order ( customer_id )")
    .eq("id", rowKey)
    .maybeSingle();
  if (findErr) fail(findErr, "Không đọc được đơn");
  if (!existing) return { ok: false, error: "Không tìm thấy đơn này. Tải lại trang giúp em." };

  const link = existing as unknown as {
    id: string;
    recipient_id: string;
    status: string;
    consume: Record<string, number> | null;
    stock_applied: boolean;
    web_order: { customer_id: string } | null;
  };

  // ---- shipment ----
  const ship: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const put = (k: string, v: unknown) => {
    if (v !== undefined) ship[k] = v;
  };
  put("status", patch.status);
  put("carrier", patch.carrier);
  put("vc_code", patch.vc);
  put("product_summary", patch.product);
  put("prepaid", patch.prepaid);
  put("cod", patch.cod);
  put("cuoc_vc", patch.cuoc_vc);
  put("phi_vc_thu_khach", patch.phi_vc_thu_khach);
  put("tags", patch.tags);
  put("note", patch.note);
  put("assignee", patch.assignee);
  // `consume` và `stock_applied` do MÁY CHỦ giữ, không nhận từ trình duyệt.
  // Trình duyệt gửi lại bản nó đọc lúc tải trang; nếu ghi đè thì cờ kho bị đẩy
  // về giá trị cũ và lần lưu sau sẽ hoàn kho thêm một lần nữa.
  put("voided", patch.voided);

  const { error: sErr } = await sb.from("shipment").update(ship).eq("id", rowKey);
  if (sErr) fail(sErr, "Không lưu được đơn");

  // Đổi sang huỷ/trả/hoàn thì hàng quay lại kho; đổi ngược lại thì trừ ra.
  await syncStockForStatus(rowKey, link, patch.status);

  // ---- recipient ----
  const rec: Record<string, unknown> = {};
  if (patch.recipient !== undefined) rec.name = patch.recipient;
  if (patch.address !== undefined) rec.address = patch.address;
  if (patch.recipientPhone !== undefined) rec.phone = patch.recipientPhone;
  if (patch.expected !== undefined) rec.desired_date = patch.expected || null;
  if (Object.keys(rec).length) {
    const { error } = await sb.from("recipient").update(rec).eq("id", link.recipient_id);
    if (error) fail(error, "Không lưu được người nhận");
  }

  // ---- customer ----
  // Sửa ở đây đổi cho TẤT CẢ đơn của khách này — đúng ý vì là cùng một người.
  const custId = link.web_order?.customer_id;
  if (custId) {
    const cust: Record<string, unknown> = {};
    if (patch.customer !== undefined) cust.name = patch.customer;
    if (patch.phone !== undefined && patch.phone.trim()) cust.phone = patch.phone.trim();
    if (Object.keys(cust).length) {
      const { error } = await sb.from("customer").update(cust).eq("id", custId);
      // 23505 = trùng SĐT với khách khác. Báo rõ thay vì nuốt lỗi.
      if (error)
        return {
          ok: (error as { code?: string }).code !== "23505",
          error:
            (error as { code?: string }).code === "23505"
              ? "SĐT này đã thuộc về một khách khác. Đổi số khác hoặc gộp khách thủ công."
              : undefined,
        };
    }
  }

  if (changes.length)
    await appendHistory([{ rowKey, orderCode: patch.orderCode ?? "", by: actor, changes }]);

  const { data: fresh } = await sb
    .from("shipment")
    .select(SHIPMENT_SELECT)
    .eq("id", rowKey)
    .maybeSingle();

  return {
    ok: true,
    order: fresh ? rowToOrder(fresh as unknown as ShipmentRow) : undefined,
  };
}

// ------------------------------------------------------------ hoàn / trừ kho
/**
 * Đồng bộ tồn kho theo trạng thái đơn — CHẠY Ở MÁY CHỦ.
 *
 * Trước đây việc này làm ở trình duyệt và ghi vào localStorage, tức là ghi vào
 * chỗ không ai đọc: huỷ đơn xong kho thật không hề được hoàn.
 *
 * Idempotent qua cờ `stock_applied`: gọi lại nhiều lần không cộng trừ thêm.
 */
async function syncStockForStatus(
  rowKey: string,
  prev: { status?: string; consume?: Record<string, number> | null; stock_applied?: boolean },
  nextStatus?: string,
) {
  const consume = prev.consume ?? {};
  const entries = Object.entries(consume).filter(([, n]) => n > 0);
  if (!entries.length) return;

  const should = !RELEASED_STATUS.has((nextStatus ?? prev.status ?? "") as Status);
  if (should === Boolean(prev.stock_applied)) return; // đã đúng trạng thái rồi

  const moves = entries
    .map(([k, n]) => {
      const p = parseKey(k);
      return p ? { kind: p.kind, id: p.id, qty: n } : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
  if (!moves.length) return;

  await adjustStock(moves, should ? -1 : 1);

  const sb = getServiceClient();
  await sb.from("shipment").update({ stock_applied: should }).eq("id", rowKey);
}

// ----------------------------------------------------------------- voidOrders
/** Xoá mềm: đánh dấu đã xoá, giữ bản ghi lại để đối soát. */
export async function voidOrders(rowKeys: string[], actor = "Bạn"): Promise<UpdateResult> {
  if (!isOrderStoreConfigured() || !rowKeys.length) return { ok: true };

  const sb = getServiceClient();

  // Hoàn kho TRƯỚC khi đánh dấu xoá — xoá xong thì không còn đường lần lại
  // đơn nào đang giữ hàng.
  const { data: rows } = await sb
    .from("shipment")
    .select("id, status, consume, stock_applied")
    .in("id", rowKeys);
  for (const r of (rows ?? []) as {
    id: string;
    status: string;
    consume: Record<string, number> | null;
    stock_applied: boolean;
  }[]) {
    await syncStockForStatus(r.id, r, "Huỷ đơn");
  }

  const { error } = await sb
    .from("shipment")
    .update({ voided: true, status: "Huỷ đơn", updated_at: new Date().toISOString() })
    .in("id", rowKeys);
  if (error) fail(error, "Không xoá được đơn");

  await appendHistory(
    rowKeys.map((k) => ({ rowKey: k, orderCode: "", by: actor, changes: ["Xoá đơn khỏi bảng"] })),
  );
  return { ok: true };
}

// --------------------------------------------------------------- appendHistory
/** Nhật ký thao tác. Lỗi ở đây KHÔNG được làm hỏng thao tác chính. */
export async function appendHistory(
  entries: { rowKey: string; orderCode: string; by: string; changes: string[] }[],
) {
  if (!isOrderStoreConfigured() || !entries.length) return;
  try {
    const sb = getServiceClient();
    await sb.from("order_history").insert(
      entries.map((e) => ({
        shipment_id: e.rowKey,
        actor: e.by,
        changes: e.changes,
      })),
    );
  } catch (e) {
    console.error("ORDER_HISTORY_WRITE_FAILED", e instanceof Error ? e.message : e);
  }
}
