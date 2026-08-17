import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { getBoxes, getCombos, getFlavors, getWarehouses, getFxRate } from "@/lib/catalog";
import { adjustStock, type StockMove } from "@/lib/products/stock";
import { findLink, markLinkUsed, normalizeRef, registerRefIfNew } from "@/lib/orders/links";

import { normalizePhone } from "@/lib/phone";
import { boxPrice, comboOptions, comboPrice, validateBoxFill, shipFeeForRegion } from "@/lib/pricing";
import { currencyOf } from "@/lib/money";
import type { Region } from "@/lib/types";

/** Dòng đơn → tiêu hao kho theo khoá sản phẩm. Cùng quy ước với parseKey(). */
function linesToConsume(lines: { kind: string; comboId?: string; boxId?: string; flavorIds?: string[]; qty: number }[]) {
  const c: Record<string, number> = {};
  const add = (k: string | undefined, n: number) => {
    if (!k || n <= 0) return;
    c[k] = (c[k] ?? 0) + n;
  };
  for (const l of lines) {
    if (l.kind === "combo" && l.comboId) add(`combo:${l.comboId}`, l.qty);
    else if (l.kind === "box" && l.boxId) add(`box:${l.boxId}`, l.qty);
    else if (l.kind === "la" && l.flavorIds?.[0]) add(`flavor:${l.flavorIds[0]}`, l.qty);
  }
  return c;
}

// ============================================================================
// Tạo đơn (§8.1) — transaction: validate + re-check giá server-side + snapshot
// giá/fx + dựng recipient/order_line/shipment. Không tin giá client gửi lên.
// ============================================================================

export interface CreateOrderInput {
  buyer: {
    name: string;
    phone: string;
    region: Region;
    /** Tên Facebook khách tự khai. Không bắt buộc; link Messenger được ưu tiên hơn. */
    fbName?: string;
    refToken?: string;
  };
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
  /**
   * Tiêu hao kho của kiện: khoá sản phẩm (`combo:<id>` / `box:<id>` /
   * `flavor:<id>`) → số lượng. Trước đây là mã SKU của bảng định mức cũ, mà
   * bảng đó dựng theo menu cũ nên set bán theo lựa chọn nhân ra rỗng — huỷ đơn
   * không biết hoàn cái gì.
   */
  consume: Record<string, number>;
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

/**
 * Mã kiện dùng chống ghi trùng. Dựng từ mã đơn do DATABASE sinh (§0020) nên tự
 * đúng theo; ứng dụng không còn tự chế mã nữa.
 */
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
  // `chargeShip`: món này có thu phí ship riêng không (§0022). Chốt ở đây, lúc
  // đã tra được sản phẩm thật trong danh mục — client không có tiếng nói.
  type PricedLine = CreateOrderInput["lines"][number] & { unit: number; chargeShip: boolean };
  const pricedLines: PricedLine[] = [];
  // `let` vì nhánh set cố định thay boxId/flavorIds bằng giá trị từ danh mục.
  for (let l of input.lines) {
    if (!input.recipients.some((r) => r.uid === l.recipientUid))
      return { ok: false, error: "Có dòng hàng chưa gán người nhận hợp lệ." };
    const qty = Math.max(1, Math.floor(l.qty || 1));
    let unit = 0;
    let chargeShip = false;

    if (l.kind === "box") {
      const box = boxes.find((b) => b.id === l.boxId && b.active);
      if (!box) return { ok: false, error: "Hộp không tồn tại hoặc ngừng bán." };
      const v = validateBoxFill(box, l.flavorIds ?? [], flavors);
      if (!v.ok) return { ok: false, error: v.error };
      unit = boxPrice(box, l.flavorIds ?? [], flavors, region);
      // Vỏ hộp thu phí, hoặc có vị nào bên trong thu phí.
      chargeShip =
        !!box.charge_ship ||
        (l.flavorIds ?? []).some((id) => flavors.find((f) => f.id === id)?.charge_ship);
    } else if (l.kind === "la") {
      const f = flavors.find((x) => x.id === l.flavorIds?.[0] && x.active);
      if (!f) return { ok: false, error: "Vị mua lẻ không hợp lệ." };
      unit = region === "vn" ? f.price_vn : f.price_kr;
      chargeShip = !!f.charge_ship;
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
      chargeShip = !!combo.charge_ship;
      // vị của set do danh mục quyết định, dùng luôn cho mô tả kiện
      l = { ...l, boxId: combo.box_id ?? undefined, flavorIds: combo.flavor_ids };
    }

    subtotal += unit * qty;
    pricedLines.push({ ...l, qty, unit, chargeShip });
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
      // Ngưỡng miễn phí ship xét theo số phần VÀ tiền hàng của CHÍNH kiện này
      // (§ fee_table) — `sub` phải tính trước phí, vì nó là đầu vào của phí.
      const parcelQty = mine.reduce((n, l) => n + l.qty, 0);
      const sub = mine.reduce((s, l) => s + l.unit * l.qty, 0);
      const fee = shipFeeForRegion(r.region, region, warehouses, fx, {
        qty: parcelQty,
        amount: sub,
        // Một kiện đi một lần: chỉ cần MỘT món thu phí là kiện đó thu, và thu
        // đúng một lần dù kiện có bao nhiêu món (§0022).
        chargeShip: mine.some((l) => l.chargeShip),
      });
      shippingTotal += fee.shipping;
      handlingTotal += fee.handling;
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
        consume: linesToConsume(mine),
      };
    })
    .filter((x): x is OrderParcel => x !== null);

  const grandTotal = subtotal + shippingTotal + handlingTotal;
  const currency = currencyOf(region);

  // Mã đơn do DATABASE sinh (cột `code` sinh từ order_no, §0019/0020) — ứng dụng
  // tự chế mã thì hai đơn cùng lúc có thể trùng, và mã dễ lệch khỏi số thứ tự.
  // Chế độ xem thử chưa có database nên dùng mã tạm, chỉ để nhìn giao diện.
  const summary = {
    code: "DK----",
    transferCode: "DK----",
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

    // Khách đến từ link Messenger: tra token Ở MÁY CHỦ để biết đó là ai.
    //
    // Bản cũ tra trong localStorage của TRÌNH DUYỆT KHÁCH — nơi không bao giờ
    // có link vì link được tạo trên máy của shop. Nên tên khách Facebook chưa
    // bao giờ gắn được vào đơn, chỉ có mỗi cái thẻ "Messenger".
    // Chưa biết khách này thì ghi nhận luôn, để lần sau tra ra và để shop đặt
    // tên lại được ở trang Messenger.
    // Bóc {{ }} và loại biến chưa thay TRƯỚC KHI lưu, không thì rác chui vào
    // database rồi link mở chat dựng từ đó là hỏng.
    const ref = normalizeRef(buyer.refToken);
    const link =
      (await findLink(ref)) ?? (ref ? await registerRefIfNew(ref, buyer.name) : null);

    // Tên Facebook: link truy vết ĐỨNG TRƯỚC tên khách tự gõ. Tên từ link là do
    // Pancake/shop gắn với đúng cuộc chat; khách gõ tay thì hay sai chính tả hoặc
    // ghi biệt danh khác, đè lên là mất mối nối đã chắc chắn.
    const messengerName = link?.customerName || buyer.fbName?.trim() || "";

    // upsert customer theo phone chuẩn hoá
    const { data: cust, error: cErr } = await sb
      .from("customer")
      .upsert(
        {
          name: buyer.name,
          phone: buyerPhone,
          region,
          // Chỉ ghi đè khi LẦN NÀY biết được. Để `null` vào đây thì đơn sau đặt
          // không qua link sẽ xoá mất tên Messenger đã biết từ trước.
          ...(messengerName ? { messenger_name: messengerName } : {}),
          ...(link
            ? {
                psid: link.psid || null,
                conversation_link: link.conversationLink || null,
              }
            : {}),
        },
        { onConflict: "phone" },
      )
      .select("id")
      .single();
    if (cErr || !cust) throw cErr ?? new Error("Không tạo được khách.");

    const { data: order, error: oErr } = await sb
      .from("web_order")
      .insert({
        customer_id: cust.id,
        buyer_region: region,
        currency,
        fx_rate_snapshot: fx,
        ref_token: ref ?? null,
        subtotal,
        shipping_total: shippingTotal,
        handling_total: handlingTotal,
        grand_total: grandTotal,
        payment_status: "pending",
        fulfillment_status: "pending_payment",
      })
      .select("id, code")
      .single();
    if (oErr || !order) throw oErr ?? new Error("Không tạo được đơn.");

    // Mã thật chỉ có SAU khi database sinh. Nội dung chuyển khoản dùng luôn mã
    // đó — DK0001 không có gạch nối nên khỏi phải cắt gọt gì.
    //
    // `transfer_code` cũng là cột sinh tự động (§0021) nên không ghi ở đây nữa.
    // Bản trước UPDATE nó SAU khi insert, mà cột lúc đó còn NOT NULL không có
    // default — insert chết trước khi tới được dòng UPDATE, và cả đường đặt hàng
    // của khách đứng im.
    const code = (order as { code: string }).code;
    summary.code = code;
    summary.transferCode = code;

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
        goods_amount: parcel.subtotal,
        shipping_fee: parcel.shipping,
        handling_fee: parcel.handling,
        shipping_mode: wh.shipping_mode,
        idempotency_key: genIdem(code, i),
        parcel_index: i,
        parcel_count: shipments.length,
        status: "Mới",
        // ĐƠN MỚI LÀ CHƯA THU ĐƯỢC ĐỒNG NÀO.
        //
        // Khách bấm đặt xong mới đi chuyển khoản, có người chuyển ngay, có người
        // vài hôm sau, có người không chuyển. Nên toàn bộ tiền vào `cod` (tiền
        // còn ở ngoài), `prepaid` để 0 (tiền đã nằm trong tay).
        //
        // Bản cũ ghi thẳng vào `prepaid`. Mà `prepaid` được mọi nơi — Thu chi,
        // bảng điều hành, trang khách hàng — tính là TIỀN ĐÃ VỀ. Hậu quả: khách
        // vừa bấm đặt là doanh thu đã nhảy lên, chưa ai trả đồng nào; nút "Đã thu
        // tiền" bấm vào cũng không đổi được gì vì tiền đã bị tính rồi. Con số
        // doanh thu vì thế luôn là số ĐƠN ĐÃ ĐẶT, không phải số TIỀN ĐÃ NHẬN.
        //
        // Tiền chỉ chuyển sang "đã về" khi anh chủ tự bấm "Đã thu tiền" — người
        // duy nhất nhìn được sổ ngân hàng.
        //
        // Tiền ở TIỀN TỆ NGƯỜI ĐẶT (§5), cùng đơn vị với web_order.currency, nên
        // cộng các kiện lại vẫn đúng bằng grand_total.
        prepaid: 0,
        cod: parcel.total,
        product_summary: parcel.items,
        consume: parcel.consume,
        stock_applied: true,
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

    // Ghi lại token đã sinh ra đơn nào — để không dùng lại nhầm và để đối soát.
    if (buyer.refToken) await markLinkUsed(buyer.refToken, code);

    return { ok: true, order: summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi tạo đơn." };
  }
}
