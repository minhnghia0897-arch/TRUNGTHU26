import { getServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getBoxes, getFlavors, getWarehouses, getFxRate } from "@/lib/catalog";
import { normalizePhone } from "@/lib/phone";
import { boxPrice, validateBoxFill, shipFeeForRegion } from "@/lib/pricing";
import { currencyOf } from "@/lib/money";
import type { Region } from "@/lib/types";

// ============================================================================
// Tạo đơn (§8.1) — transaction: validate + re-check giá server-side + snapshot
// giá/fx + dựng recipient/order_line/shipment. Không tin giá client gửi lên.
// ============================================================================

export interface CreateOrderInput {
  buyer: { name: string; phone: string; region: Region; refToken?: string };
  recipients: {
    uid: string;
    name: string;
    phone: string;
    address: string;
    region: Region;
    desiredDate?: string;
  }[];
  lines: {
    kind: "box" | "combo" | "la";
    boxId?: string;
    comboId?: string;
    flavorIds?: string[];
    qty: number;
    recipientUid: string;
  }[];
}

export interface CreateOrderResult {
  ok: boolean;
  error?: string;
  order?: {
    code: string;
    transferCode: string;
    currency: string;
    subtotal: number;
    shippingTotal: number;
    handlingTotal: number;
    grandTotal: number;
    shipments: { recipientName: string; region: Region; fee: number }[];
    simulated?: boolean;
  };
}

const rand = (n: number) => Math.floor(Math.random() * n);
const genCode = () => "TR-" + (1000 + rand(9000));
const genTransfer = () => "TR" + Date.now().toString(36).toUpperCase().slice(-6);
const genIdem = (code: string, i: number) => `${code}-ship-${i}`;

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const buyer = input.buyer;
  const region = buyer.region;

  // --- SĐT bắt buộc + chuẩn hoá (§10.1) ---
  const buyerPhone = normalizePhone(buyer.phone, region);
  if (!buyer.name?.trim()) return { ok: false, error: "Thiếu tên người đặt." };
  if (!buyerPhone) return { ok: false, error: "SĐT người đặt không hợp lệ." };
  if (!input.recipients.length) return { ok: false, error: "Chưa có người nhận." };
  if (!input.lines.length) return { ok: false, error: "Giỏ trống." };

  // --- load danh mục (re-check active + giá từ nguồn, không tin client) ---
  const [boxes, flavors, warehouses, fx] = await Promise.all([
    getBoxes(),
    getFlavors(),
    getWarehouses(),
    getFxRate(),
  ]);

  // --- mỗi recipient phải có kho active (§7) ---
  for (const r of input.recipients) {
    if (!warehouses.some((w) => w.region === r.region && w.active))
      return { ok: false, error: `Vùng "${r.region}" chưa có kho — không giao được.` };
    if (!r.name?.trim() || !r.address?.trim())
      return { ok: false, error: "Người nhận thiếu tên hoặc địa chỉ." };
  }

  // --- validate + tính giá server-side từng dòng ---
  let subtotal = 0;
  type PricedLine = CreateOrderInput["lines"][number] & { unit: number };
  const pricedLines: PricedLine[] = [];
  for (const l of input.lines) {
    if (!input.recipients.some((r) => r.uid === l.recipientUid))
      return { ok: false, error: "Có dòng hàng chưa gán người nhận hợp lệ." };
    const qty = Math.max(1, Math.floor(l.qty || 1));
    let unit = 0;

    if (l.kind === "box") {
      const box = boxes.find((b) => b.id === l.boxId && b.active);
      if (!box) return { ok: false, error: "Hộp không tồn tại hoặc ngừng bán." };
      const v = validateBoxFill(box, l.flavorIds ?? [], flavors);
      if (!v.ok) return { ok: false, error: v.error };
      unit = boxPrice(box, l.flavorIds ?? [], flavors, region);
    } else if (l.kind === "la") {
      const f = flavors.find((x) => x.id === l.flavorIds?.[0] && x.active);
      if (!f) return { ok: false, error: "Vị mua lẻ không hợp lệ." };
      unit = region === "vn" ? f.price_vn : f.price_kr;
    } else {
      // combo: coi như hộp với vị cố định — đơn giản hoá dùng giá box
      const box = boxes.find((b) => b.id === l.boxId && b.active);
      if (!box) return { ok: false, error: "Combo không hợp lệ." };
      unit = boxPrice(box, l.flavorIds ?? [], flavors, region);
    }

    subtotal += unit * qty;
    pricedLines.push({ ...l, qty, unit });
  }

  // --- phí ship + handling theo recipient, quy đổi qua fx snapshot ---
  let shippingTotal = 0;
  let handlingTotal = 0;
  const shipments = input.recipients
    .map((r) => {
      const hasItems = pricedLines.some((l) => l.recipientUid === r.uid);
      if (!hasItems) return null;
      const fee = shipFeeForRegion(r.region, region, warehouses, fx);
      shippingTotal += fee.shipping;
      handlingTotal += fee.handling;
      return { recipientName: r.name, region: r.region, fee: fee.shipping + fee.handling };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const grandTotal = subtotal + shippingTotal + handlingTotal;
  const code = genCode();
  const transferCode = genTransfer();
  const currency = currencyOf(region);

  const summary = {
    code,
    transferCode,
    currency,
    subtotal,
    shippingTotal,
    handlingTotal,
    grandTotal,
    shipments,
  };

  // --- chưa cấu hình Supabase → trả đơn mô phỏng (dev), luồng vẫn chạy ---
  if (!isSupabaseConfigured) {
    return { ok: true, order: { ...summary, simulated: true } };
  }

  // --- persist qua service role (bỏ qua RLS, §4.3) ---
  try {
    const sb = getServiceClient();

    // upsert customer theo phone chuẩn hoá
    const { data: cust, error: cErr } = await sb
      .from("customer")
      .upsert({ name: buyer.name, phone: buyerPhone, region }, { onConflict: "phone" })
      .select("id")
      .single();
    if (cErr || !cust) throw cErr ?? new Error("Không tạo được khách.");

    const { data: order, error: oErr } = await sb
      .from("web_order")
      .insert({
        code,
        customer_id: cust.id,
        buyer_region: region,
        currency,
        fx_rate_snapshot: fx,
        subtotal,
        shipping_total: shippingTotal,
        handling_total: handlingTotal,
        grand_total: grandTotal,
        payment_status: "pending",
        fulfillment_status: "pending_payment",
        transfer_code: transferCode,
      })
      .select("id")
      .single();
    if (oErr || !order) throw oErr ?? new Error("Không tạo được đơn.");

    // recipients → map uid → id
    const recipIdByUid: Record<string, string> = {};
    for (const r of input.recipients) {
      const { data: rec, error: rErr } = await sb
        .from("recipient")
        .insert({
          web_order_id: order.id,
          name: r.name,
          phone: normalizePhone(r.phone, r.region) ?? r.phone,
          address: r.address,
          region: r.region,
          desired_date: r.desiredDate || null,
        })
        .select("id")
        .single();
      if (rErr || !rec) throw rErr ?? new Error("Không tạo được người nhận.");
      recipIdByUid[r.uid] = rec.id;
    }

    // order lines
    for (const l of pricedLines) {
      await sb.from("order_line").insert({
        web_order_id: order.id,
        recipient_id: recipIdByUid[l.recipientUid],
        kind: l.kind,
        box_id: l.boxId ?? null,
        combo_id: l.comboId ?? null,
        flavors: l.flavorIds ?? null,
        qty: l.qty,
        unit_price: l.unit,
        line_total: l.unit * l.qty,
        price_source: { region },
      });
    }

    // shipments (1/recipient) — idempotency_key cố định (§10.2)
    let i = 0;
    for (const r of input.recipients) {
      if (!pricedLines.some((l) => l.recipientUid === r.uid)) continue;
      i += 1;
      const wh = warehouses.find((w) => w.region === r.region && w.active)!;
      const fee = shipFeeForRegion(r.region, region, warehouses, fx);
      await sb.from("shipment").insert({
        web_order_id: order.id,
        recipient_id: recipIdByUid[r.uid],
        fulfillment_region: r.region,
        warehouse_id: wh.id,
        shipping_fee: fee.shipping,
        handling_fee: fee.handling,
        shipping_mode: wh.shipping_mode,
        idempotency_key: genIdem(code, i),
        prepaid: 0,
        source: "web",
      });
    }

    return { ok: true, order: summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi tạo đơn." };
  }
}
