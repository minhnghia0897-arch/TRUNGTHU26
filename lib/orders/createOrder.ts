import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { getBoxes, getCombos, getFlavors, getWarehouses, getFxRate } from "@/lib/catalog";
import { adjustStock, type StockMove } from "@/lib/products/stock";
import { normalizePhone } from "@/lib/phone";
import { boxPrice, comboOptions, comboPrice, validateBoxFill, shipFeeForRegion } from "@/lib/pricing";
import { currencyOf } from "@/lib/money";
import { cartConsume } from "@/lib/webInventory";
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
    note?: string;
  }[];
  lines: {
    kind: "box" | "combo" | "la";
    boxId?: string;
    comboId?: string;
    variantName?: string;
    flavorIds?: string[];
    qty: number;
    recipientUid: string;
  }[];
}

/** Một kiện = một người nhận = một bản ghi `shipment`. */
export interface OrderParcel {
  /** uid người nhận do client sinh — chỉ dùng nội bộ để khớp kiện với recipient. */
  uid: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  region: Region; // kho xuất hàng — KHÔNG phải tiền tệ
  desiredDate?: string;
  note?: string;
  items: string; // mô tả sản phẩm của kiện
  subtotal: number; // tiền hàng, ở tiền tệ NGƯỜI ĐẶT
  shipping: number;
  handling: number;
  fee: number; // shipping + handling
  total: number; // subtotal + fee
  consume: Record<string, number>; // tiêu hao SKU theo BOM
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
    shipments: OrderParcel[];
    simulated?: boolean;
    /** Đã lưu được vào cơ sở dữ liệu chưa. false = đơn hợp lệ nhưng chưa lưu. */
    synced?: boolean;
  };
}

// Bỏ các ký tự khách dễ chép nhầm khi ghi nội dung chuyển khoản: B/8, I/1, O/0, S/5, Z/2
const CODE_CHARS = "ACDEFGHJKLMNPQRTUVWXY34679";
const randChars = (n: number) => {
  let s = "";
  for (let i = 0; i < n; i += 1) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
};

/**
 * Mã đơn dạng TR-260814-KQF7.
 * Bản cũ `"TR-" + rand(9000)` trùng nhau tới 50% chỉ sau ~112 đơn — mà mã này là
 * mã tra cứu của khách, trùng mã là đơn của hai khách nhập vào nhau. Có phần
 * ngày nên đơn khác ngày không bao giờ đụng; phần đuôi cho 26^4 ≈ 457.000 khả
 * năng mỗi ngày.
 */
const genCode = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `TR-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${randChars(4)}`;
};

/** Nội dung CK = mã đơn bỏ gạch nối → nhìn sao kê ngân hàng là ra đúng đơn. */
const genTransfer = (code: string) => code.replace(/-/g, "");
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
  const [boxes, combos, flavors, warehouses, fx] = await Promise.all([
    getBoxes(),
    getCombos(),
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
  // `let` vì nhánh set cố định thay boxId/flavorIds bằng giá trị từ danh mục.
  for (let l of input.lines) {
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
      // Set cố định: tra THEO comboId trong danh mục, không tin boxId/flavorIds
      // client gửi lên. Trước đây chốt giá thẳng từ boxId nên client đổi sang
      // hộp rẻ hơn là mua được set giá cao bằng giá hộp rẻ.
      const combo = combos.find((c) => c.id === l.comboId && c.active);
      if (!combo) return { ok: false, error: "Set không tồn tại hoặc ngừng bán." };

      // Set nhiều lựa chọn (VD hai loại nhân) thì giá theo ĐÚNG lựa chọn khách
      // bấm, tra lại trong danh mục — không nhận giá client gửi lên.
      const opts = comboOptions(combo, region);
      if (opts.length) {
        const picked = opts.find((o) => o.name === l.variantName);
        if (!picked)
          return {
            ok: false,
            error: `Set "${combo.name}" cần chọn loại nhân (${opts.map((o) => o.name).join(" / ")}).`,
          };
        unit = picked.price;
      } else {
        const p = comboPrice(combo, boxes, flavors, region);
        if (p === null)
          return { ok: false, error: `Set "${combo.name}" chưa có giá — chưa bán được.` };
        unit = p;
      }
      // vị của set do danh mục quyết định, dùng luôn cho mô tả kiện
      l = { ...l, boxId: combo.box_id ?? undefined, flavorIds: combo.flavor_ids };
    }

    subtotal += unit * qty;
    pricedLines.push({ ...l, qty, unit });
  }

  // Mô tả sản phẩm cho một dòng — dùng cho bảng đơn và tin nhắn xác nhận.
  const lineLabel = (l: PricedLine): string => {
    const times = l.qty > 1 ? ` ×${l.qty}` : "";
    if (l.kind === "la") {
      const f = flavors.find((x) => x.id === l.flavorIds?.[0]);
      return `${f?.name ?? "Bánh lẻ"}${times}`;
    }
    // Set: gọi đúng tên set + loại nhân. Không mượn tên hộp — hộp chỉ là quy
    // cách và thường đã tắt bán, tra trong `boxes` (chỉ có hàng đang bán) sẽ
    // không thấy, nhãn rơi về chữ "Combo" trống nghĩa trên đơn.
    if (l.kind === "combo") {
      const c = combos.find((x) => x.id === l.comboId);
      const opt = l.variantName ? ` · ${l.variantName}` : "";
      return `${c?.name ?? "Set"}${opt}${times}`;
    }
    const box = boxes.find((b) => b.id === l.boxId);
    const vi = (l.flavorIds ?? [])
      .map((id) => flavors.find((f) => f.id === id)?.name)
      .filter(Boolean);
    const base = box?.name ?? "Hộp";
    return `${base}${times}${vi.length ? ` (${vi.join(", ")})` : ""}`;
  };

  // --- phí ship + handling theo recipient, quy đổi qua fx snapshot ---
  // Tiền của MỌI kiện đều ở tiền tệ NGƯỜI ĐẶT (§5: một đơn một tiền tệ).
  // Kho giao là chuyện khác, nằm ở trường `region` — hai trục không trộn.
  let shippingTotal = 0;
  let handlingTotal = 0;
  const shipments = input.recipients
    .map((r): OrderParcel | null => {
      const mine = pricedLines.filter((l) => l.recipientUid === r.uid);
      if (!mine.length) return null;
      const fee = shipFeeForRegion(r.region, region, warehouses, fx);
      shippingTotal += fee.shipping;
      handlingTotal += fee.handling;
      const sub = mine.reduce((s, l) => s + l.unit * l.qty, 0);
      return {
        uid: r.uid,
        recipientName: r.name,
        recipientPhone: normalizePhone(r.phone, r.region) ?? r.phone ?? "",
        address: r.address,
        region: r.region,
        desiredDate: r.desiredDate,
        note: r.note,
        items: mine.map(lineLabel).join(", "),
        subtotal: sub,
        shipping: fee.shipping,
        handling: fee.handling,
        fee: fee.shipping + fee.handling,
        total: sub + fee.shipping + fee.handling,
        consume: cartConsume(mine),
      };
    })
    .filter((x): x is OrderParcel => x !== null);

  const grandTotal = subtotal + shippingTotal + handlingTotal;
  const code = genCode();
  const transferCode = genTransfer(code);
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

  // --- chưa cấu hình service role → trả đơn mô phỏng (dev), luồng vẫn chạy ---
  // Ghi bảng đơn bắt buộc service role (§4.3), anon key không đủ.
  if (!isServiceRoleConfigured) {
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

    // shipments (1/recipient) — idempotency_key cố định (§10.2).
    // Ghi luôn các trường vận hành để bảng điều hành hiển thị được ngay:
    // tiền thực của kiện, trạng thái khởi tạo, tóm tắt hàng, tiêu hao kho.
    const fromMessenger = Boolean(buyer.refToken);
    let i = 0;
    for (const r of input.recipients) {
      const parcel = shipments.find((p) => p.uid === r.uid);
      if (!parcel) continue;
      i += 1;
      const wh = warehouses.find((w) => w.region === r.region && w.active)!;
      const { error: shErr } = await sb.from("shipment").insert({
        web_order_id: order.id,
        recipient_id: recipIdByUid[r.uid],
        fulfillment_region: r.region,
        warehouse_id: wh.id,
        shipping_fee: parcel.shipping,
        handling_fee: parcel.handling,
        shipping_mode: wh.shipping_mode,
        idempotency_key: genIdem(code, i),
        parcel_index: i,
        parcel_count: shipments.length,
        status: "Mới",
        // Trả trước = tiền thực của kiện, ở TIỀN TỆ NGƯỜI ĐẶT (§5) — cùng đơn vị
        // với web_order.currency, nên cộng các kiện lại đúng bằng grand_total.
        prepaid: parcel.total,
        cod: 0,
        product_summary: parcel.items,
        consume: parcel.consume,
        stock_applied: false,
        assignee: "Web",
        tags: [fromMessenger ? "Messenger" : "Web"],
        note: parcel.note?.trim() ?? "",
        source: fromMessenger ? "facebook" : "web",
      });
      if (shErr) throw shErr;
    }

    // Trừ kho SAU KHI đơn đã ghi xong. Trước đây việc này làm ở trình duyệt của
    // khách nên chủ shop không bao giờ thấy số tồn thay đổi.
    // Không chặn khi hết hàng — tồn xuống âm và bảng điều hành báo đỏ, hợp với
    // mùa Trung Thu đặt trước nhiều.
    const moves: StockMove[] = [];
    for (const l of pricedLines) {
      if (l.kind === "combo" && l.comboId) moves.push({ kind: "combo", id: l.comboId, qty: l.qty });
      else if (l.kind === "box" && l.boxId) moves.push({ kind: "box", id: l.boxId, qty: l.qty });
      else if (l.kind === "la" && l.flavorIds?.[0])
        moves.push({ kind: "flavor", id: l.flavorIds[0], qty: l.qty });
    }
    await adjustStock(moves, -1);

    return { ok: true, order: summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi tạo đơn." };
  }
}
