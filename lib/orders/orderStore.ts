import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { adjustStock } from "@/lib/products/stock";
import { getAllProducts, parseKey } from "@/lib/products/productStore";
import { RELEASED_STATUS, type Status } from "@/lib/ordersMock";
import { ORDERS } from "@/lib/ordersMock";
import { asRegion } from "./orderSchema";
import {
  describeItems,
  itemName,
  itemPrice,
  itemsGoods,
  itemsToConsume,
  splitKey,
  type OrderItem,
} from "./orderItems";
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

  // Nạp CẢ đơn đã xoá (`voided`), không lọc bỏ ở đây nữa.
  //
  // Xoá đơn ở app này là xoá mềm — dòng vẫn nằm nguyên trong database, chỉ bị
  // đánh dấu. Nhưng câu select cũ chặn luôn nên không màn hình nào đọc tới được,
  // tức là xoá nhầm một đơn thì coi như mất, dù dữ liệu vẫn còn đó.
  //
  // Nay nạp hết, để tab "Đã xoá" ở bảng đơn xem lại được. Đơn đã xoá mang trạng
  // thái "Huỷ đơn" (nằm trong RELEASED_STATUS) nên Thu chi, Khách hàng và bảng
  // điều hành vẫn tự loại khỏi doanh thu như trước — không đụng gì tới tiền.
  const { data, error } = await sb
    .from("shipment")
    .select(SHIPMENT_SELECT)
    .limit(2000);
  if (error) fail(error, "Không đọc được đơn hàng");

  const raw = (data ?? []) as unknown as ShipmentRow[];
  const lines = await listParcelItems(raw);

  const rows = raw
    .map((s) => ({ ...rowToOrder(s), items: lines.get(parcelKey(s.web_order_id, s.recipient_id)) }))
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

// ------------------------------------------------------------- hàng của kiện
/**
 * Khoá nối `order_line` với `shipment`.
 *
 * Dòng hàng không trỏ thẳng vào kiện, mà cả hai cùng trỏ vào (đơn, người nhận).
 * Một người nhận trong một đơn = một kiện (§ createOrder), nên cặp id này xác
 * định đúng một kiện.
 */
const parcelKey = (webOrderId: unknown, recipientId: unknown) =>
  `${String(webOrderId ?? "")}|${String(recipientId ?? "")}`;

interface LineRow {
  id: string;
  web_order_id: string;
  recipient_id: string | null;
  kind: string;
  box_id: string | null;
  combo_id: string | null;
  flavors: unknown;
  qty: number;
  unit_price: number;
}

/** Dòng `order_line` → khoá món dùng chung với tồn kho. */
function lineKey(l: LineRow): string | null {
  if (l.kind === "combo" && l.combo_id) return `combo:${l.combo_id}`;
  if (l.kind === "box" && l.box_id) return `box:${l.box_id}`;
  if (l.kind === "la") {
    const first = Array.isArray(l.flavors) ? l.flavors[0] : null;
    if (first) return `flavor:${String(first)}`;
  }
  return null;
}

/** Hàng của từng kiện, gom theo (đơn, người nhận). */
async function listParcelItems(rows: ShipmentRow[]): Promise<Map<string, OrderItem[]>> {
  const out = new Map<string, OrderItem[]>();
  const orderIds = [...new Set(rows.map((r) => String(r.web_order_id ?? "")).filter(Boolean))];
  if (!orderIds.length) return out;

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("order_line")
    .select("id, web_order_id, recipient_id, kind, box_id, combo_id, flavors, qty, unit_price")
    .in("web_order_id", orderIds);
  // Đọc hụt dòng hàng KHÔNG được làm sập bảng đơn: mất phần sửa hàng còn hơn
  // mất cả bảng. Popup sẽ dựng tạm từ `consume` như đơn tạo tay.
  if (error) {
    console.error("ORDER_LINES_READ_FAILED", error.message);
    return out;
  }

  for (const l of (data ?? []) as LineRow[]) {
    const key = lineKey(l);
    if (!key || !l.recipient_id) continue;
    const k = parcelKey(l.web_order_id, l.recipient_id);
    const list = out.get(k) ?? [];
    list.push({ lineId: l.id, key, qty: Number(l.qty) || 0, unitPrice: Number(l.unit_price) || 0 });
    out.set(k, list);
  }
  return out;
}

// ---------------------------------------------------------------- appendOrders
/**
 * Dữ liệu tối thiểu để dựng một kiện (đơn tạo tay ở bảng điều hành).
 *
 * `orderCode`/`transferCode` bỏ ra ngoài: mã do DATABASE sinh (§0020/§0021), nên
 * client gửi lên cũng không ai dùng — để lại trong kiểu chỉ mời người sau tưởng
 * là mình đặt được mã.
 */
export type NewParcel = Omit<
  StoredOrder,
  | "id"
  | "rowKey"
  | "created"
  | "createdAtIso"
  | "updatedAtIso"
  | "voided"
  | "orderCode"
  | "transferCode"
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

  // Khách: gộp theo SĐT. Không có SĐT thì dựng khoá tạm để không đụng ràng buộc
  // unique của cột phone. Khoá này chỉ cần KHÁC NHAU; không dùng mã đơn được vì
  // mã do database sinh, mà khách phải có trước khi tạo đơn.
  const phone =
    first.phone?.trim() ||
    `tay-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
  // `code` và `transfer_code` là cột SINH TỰ ĐỘNG (§0020/§0021) — ghi tay vào là
  // Postgres từ chối cả câu INSERT. Đơn tạo tay vì thế cũng chạy chung dãy
  // DK0001 với đơn khách đặt, đúng yêu cầu "cùng một mã số".
  const { data: order, error: oErr } = await sb
    .from("web_order")
    .insert({
      customer_id: cust!.id,
      buyer_region: first.region,
      currency: first.currency,
      fx_rate_snapshot: first.fx || 18.5,
      subtotal: total,
      grand_total: total,
      payment_status: "pending",
      fulfillment_status: "draft",
    })
    .select("id, code")
    .single();
  if (oErr || !order) fail(oErr, "Không tạo được đơn");

  const orderCode = (order as unknown as { code: string }).code;

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
        idempotency_key: `${orderCode}-ship-${p.parcelIndex}`,
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
      orderCode,
      by: "Bạn",
      changes: ["Tạo đơn mới"],
    })),
  );

  return { rowKeys };
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
    .select(
      "id, recipient_id, web_order_id, status, consume, stock_applied, prepaid, " +
        "shipping_fee, handling_fee, web_order ( customer_id, buyer_region )",
    )
    .eq("id", rowKey)
    .maybeSingle();
  if (findErr) fail(findErr, "Không đọc được đơn");
  if (!existing) return { ok: false, error: "Không tìm thấy đơn này. Tải lại trang giúp em." };

  const link = existing as unknown as {
    id: string;
    recipient_id: string;
    web_order_id: string;
    status: string;
    consume: Record<string, number> | null;
    stock_applied: boolean;
    prepaid: number | null;
    shipping_fee: number | null;
    handling_fee: number | null;
    web_order: { customer_id: string; buyer_region: string } | null;
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

  // ---- hàng trong kiện ----
  // Có `items` là anh vừa sửa hàng trong popup chi tiết. Máy chủ tự tính lại
  // tiền hàng, tóm tắt và tiêu hao kho từ danh mục — KHÔNG nhận giá trình duyệt
  // gửi lên, đúng nếp chốt giá server-side của đường đặt hàng (§8.1).
  if (Array.isArray(patch.items)) {
    const applied = await applyItems(link, patch.items);
    ship.goods_amount = applied.goods;
    ship.product_summary = applied.summary;
    ship.consume = applied.consume;
    // Vừa sửa hàng vừa đổi trạng thái trong một lần lưu: phần hoàn/trừ kho theo
    // trạng thái bên dưới phải chạy trên SỐ LƯỢNG MỚI, không thì đơn hoàn về kho
    // đúng số cũ và tồn lệch đi phần vừa sửa.
    link.consume = applied.consume;

    // Tiền hàng đổi thì tổng phải thu đổi theo. Giữ nguyên phần ĐÃ CỌC (tiền đã
    // nằm trong tay, sửa hàng không làm nó biến mất) và dồn phần còn lại vào
    // COD. Cùng công thức với popup chi tiết nên hai bên ra một con số.
    const fee = (link.shipping_fee ?? 0) + (link.handling_fee ?? 0);
    const total = applied.goods + fee;
    const prepaid = Math.min(Math.max(0, patch.prepaid ?? link.prepaid ?? 0), total);
    ship.prepaid = prepaid;
    ship.cod = total - prepaid;
  }

  const { error: sErr } = await sb.from("shipment").update(ship).eq("id", rowKey);
  if (sErr) fail(sErr, "Không lưu được đơn");

  // Tổng của cả đơn cộng lại từ các kiện — trang "Tra cứu đơn" của khách đọc
  // `grand_total`, không đọc từng kiện. Không cộng lại thì khách vẫn thấy số
  // tiền cũ sau khi shop sửa hàng.
  if (Array.isArray(patch.items)) await syncOrderTotals(link.web_order_id);

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

// ------------------------------------------------------- sửa hàng trong kiện
/** Kiện đang sửa, đủ thông tin để dò dòng hàng và tính lại kho. */
interface ParcelLink {
  recipient_id: string;
  web_order_id: string;
  consume: Record<string, number> | null;
  stock_applied: boolean;
  web_order: { buyer_region: string } | null;
}

/**
 * Ghi lại hàng trong một kiện, trả về những gì kiện đó phải mang theo sau khi
 * sửa: tiền hàng, tóm tắt và tiêu hao kho.
 *
 * Ba điều giữ chặt ở đây:
 *  1. GIÁ KHÔNG NHẬN TỪ TRÌNH DUYỆT. Món cũ giữ đơn giá đã chốt lúc khách đặt
 *     (dò theo `lineId`), món mới lấy giá niêm yết hiện tại từ danh mục. Nhận
 *     giá client gửi lên thì ai mở được popup cũng đặt lại giá đơn được.
 *  2. Món không tra ra giá thì NÉM LỖI, không lặng lẽ tính 0đ.
 *  3. Kho cộng trừ theo PHẦN CHÊNH, và chỉ khi kiện đang thật sự giữ hàng
 *     (`stock_applied`). Đơn đã huỷ/hoàn thì hàng đã trả về kho rồi, sửa tiếp
 *     mà trừ nữa là kho hụt đúng một lần nữa.
 */
async function applyItems(
  link: ParcelLink,
  incoming: OrderItem[],
): Promise<{ goods: number; summary: string; consume: Record<string, number> }> {
  const sb = getServiceClient();

  const cat = await getAllProducts();
  if (!cat) throw new Error("Chưa đọc được danh mục sản phẩm nên chưa sửa được hàng trong đơn.");
  const buyer = asRegion(String(link.web_order?.buyer_region ?? ""));

  const { data: exData, error: exErr } = await sb
    .from("order_line")
    .select("id, unit_price")
    .eq("web_order_id", link.web_order_id)
    .eq("recipient_id", link.recipient_id);
  if (exErr) fail(exErr, "Không đọc được hàng trong đơn");
  const before = new Map(
    ((exData ?? []) as { id: string; unit_price: number }[]).map((l) => [l.id, l]),
  );

  // --- chốt giá từng món ---
  const priced: OrderItem[] = [];
  for (const raw of incoming) {
    if (!splitKey(raw.key ?? "")) continue;
    const qty = Math.max(1, Math.floor(Number(raw.qty) || 0));
    const old = raw.lineId ? before.get(raw.lineId) : undefined;
    const unit = old ? Number(old.unit_price) || 0 : itemPrice(raw, cat, buyer);
    if (unit === null)
      throw new Error(
        `Món "${itemName(raw, cat)}" chưa có giá ở vùng này — đặt giá ở trang Sản phẩm rồi sửa lại.`,
      );
    priced.push({ lineId: old ? raw.lineId : undefined, key: raw.key, variant: raw.variant, qty, unitPrice: unit });
  }
  if (!priced.length) throw new Error("Đơn phải còn ít nhất một món. Muốn bỏ hẳn thì xoá đơn.");

  // --- ghi lại dòng hàng ---
  const keep = new Set(priced.map((p) => p.lineId).filter(Boolean) as string[]);
  const drop = [...before.keys()].filter((id) => !keep.has(id));
  if (drop.length) {
    const { error } = await sb.from("order_line").delete().in("id", drop);
    if (error) fail(error, "Không xoá được món khỏi đơn");
  }

  for (const p of priced) {
    if (p.lineId) {
      const { error } = await sb
        .from("order_line")
        .update({ qty: p.qty, line_total: p.unitPrice * p.qty })
        .eq("id", p.lineId);
      if (error) fail(error, "Không sửa được số lượng");
      continue;
    }

    const parsed = splitKey(p.key)!;
    const combo = parsed.kind === "combo" ? cat.combos.find((c) => c.id === parsed.id) : undefined;
    const { error } = await sb.from("order_line").insert({
      web_order_id: link.web_order_id,
      recipient_id: link.recipient_id,
      kind: parsed.kind === "flavor" ? "la" : parsed.kind,
      box_id: parsed.kind === "box" ? parsed.id : combo?.box_id ?? null,
      combo_id: parsed.kind === "combo" ? parsed.id : null,
      flavors:
        parsed.kind === "flavor" ? [parsed.id] : parsed.kind === "combo" ? combo?.flavor_ids ?? null : null,
      qty: p.qty,
      unit_price: p.unitPrice,
      line_total: p.unitPrice * p.qty,
      // Ghi rõ dòng này do bảng điều hành thêm vào, không phải giá khách bấm
      // lúc đặt — sau này đối soát còn biết đường lần.
      price_source: { region: buyer, edited: "dashboard" },
    });
    if (error) fail(error, "Không thêm được món vào đơn");
  }

  // --- kho: chỉ cộng trừ PHẦN CHÊNH ---
  const consume = itemsToConsume(priced);
  if (link.stock_applied) {
    const old = link.consume ?? {};
    const moves = [...new Set([...Object.keys(old), ...Object.keys(consume)])]
      .map((key) => {
        const delta = (consume[key] ?? 0) - (old[key] ?? 0);
        const p = delta ? parseKey(key) : null;
        return p ? { kind: p.kind, id: p.id, qty: delta } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    // sign -1: thêm hàng vào đơn thì kho trừ đi, bớt hàng thì kho nhận lại.
    await adjustStock(moves, -1);
  }

  return { goods: itemsGoods(priced), summary: describeItems(priced, cat), consume };
}

/**
 * Cộng lại tổng tiền của cả đơn từ các kiện còn sống.
 *
 * Lỗi ở đây KHÔNG được làm hỏng thao tác sửa: kiện đã ghi xong rồi, ném lỗi chỉ
 * khiến màn hình báo lưu hụt trong khi thực ra đã lưu.
 */
async function syncOrderTotals(webOrderId: string) {
  if (!webOrderId) return;
  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("shipment")
      .select("goods_amount, shipping_fee, handling_fee, voided")
      .eq("web_order_id", webOrderId);
    if (error) throw new Error(error.message);

    const live = ((data ?? []) as {
      goods_amount: number | null;
      shipping_fee: number | null;
      handling_fee: number | null;
      voided: boolean | null;
    }[]).filter((r) => r.voided !== true);

    const subtotal = live.reduce((s, r) => s + (r.goods_amount ?? 0), 0);
    const shipping = live.reduce((s, r) => s + (r.shipping_fee ?? 0), 0);
    const handling = live.reduce((s, r) => s + (r.handling_fee ?? 0), 0);

    await sb
      .from("web_order")
      .update({
        subtotal,
        shipping_total: shipping,
        handling_total: handling,
        grand_total: subtotal + shipping + handling,
      })
      .eq("id", webOrderId);
  } catch (e) {
    console.error("ORDER_TOTALS_SYNC_FAILED", e instanceof Error ? e.message : e);
  }
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
