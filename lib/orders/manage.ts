import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import type { Currency, Region } from "@/lib/types";

// ============================================================================
// Bảng đơn cho NGƯỜI ĐẶT NHIỀU ĐƠN (KOL/đại lý đặt hộ khách của họ).
//
// Khác trang tra cứu thường (che tên, giấu địa chỉ): ở đây trả ĐỦ thông tin
// người nhận — vì người tra chính là NGƯỜI ĐẶT, mọi tên/SĐT/địa chỉ này do
// chính tay họ nhập lúc lên đơn. Chìa khoá vẫn chỉ là SĐT người đặt nên có
// rate-limit; muốn chặt hơn nữa (mã PIN riêng cho đại lý) thì thêm sau.
//
// SỬA ĐƠN: người đặt sửa được tên/SĐT/địa chỉ/hẹn giao/ghi chú của TỪNG KIỆN
// khi kiện còn nằm trong tay shop. Từ lúc hàng rời đi ("Chờ chuyển hàng" trở
// đi) hay đơn đã kết (huỷ/trả/hoàn) thì KHOÁ — muốn đổi phải nhắn shop.
// Không cho sửa món/tiền/kho ở đây: các thứ đó đụng giá và tồn kho, phải qua
// tay shop ở Dashboard.
// ============================================================================

/** Kiện còn sửa được khi trạng thái nằm trong nhóm này. */
export const EDITABLE_STATUS = new Set(["Mới", "Chờ hàng", "Đã xác nhận", "Đang đóng hàng"]);

/** Một dòng SET TỰ CHỌN VỊ trong kiện — cho người đặt đổi ruột hộp.
 *  Đổi vị KHÔNG đổi giá (set một giá) và KHÔNG đụng tồn kho (kho trừ theo
 *  set), nên đây là phần duy nhất của "món" mà người đặt được tự sửa. */
export interface PickLine {
  lineId: string;
  comboName: string;
  qty: number;
  /** Mỗi hộp bốc đúng bằng này vị (trùng nhau được). */
  pickCount: number;
  pool: { id: string; name: string }[];
  flavorIds: string[];
}

export interface ManageRow {
  shipmentId: string;
  recipientId: string;
  orderCode: string;
  /** Mã hiển thị: DK0007 hoặc DK0007-2 khi đơn nhiều kiện. */
  display: string;
  createdAtIso: string;
  paymentStatus: string;
  currency: Currency;
  status: string;
  editable: boolean;
  name: string;
  phone: string;
  address: string;
  region: Region;
  desiredDate: string;
  items: string;
  carrier: string;
  vc: string;
  note: string;
  /** Tiền của kiện (đã thu + còn phải thu), cùng tiền tệ của đơn. */
  amount: number;
  /** Các set tự chọn vị trong kiện — có thì cho đổi ruột hộp. */
  picks?: PickLine[];
}

export interface ManageResult {
  configured: boolean;
  rows: ManageRow[];
}

const phoneCandidates = (rawPhone: string): string[] =>
  [normalizePhone(rawPhone, "kr"), normalizePhone(rawPhone, "vn"), rawPhone.trim()].filter(
    (x): x is string => Boolean(x),
  );

// ---- chế độ xem thử --------------------------------------------------------
// Chưa nối database (chạy local, preview trần) thì trả bộ đơn mẫu và cho sửa
// ngay trên bộ nhớ — đủ để xem trọn luồng đại lý mà không cần đơn thật.
let demoRows: ManageRow[] | null = null;

/** Ruột 6 vị 150g của set tự chọn (TÊN GỌN) — chỉ dùng cho bộ đơn mẫu. */
const DEMO_POOL = [
  { id: "f1", name: "Matcha Trà Xanh" },
  { id: "f2", name: "Socola Dừa" },
  { id: "f3", name: "Đậu Xanh" },
  { id: "f4", name: "Lava" },
  { id: "f5", name: "Dẻo" },
  { id: "f6", name: "Thập Cẩm" },
];

const describeIds = (ids: string[], pool: { id: string; name: string }[]): string => {
  const count = new Map<string, number>();
  for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count.entries()]
    .map(([id, n]) => {
      const name = pool.find((f) => f.id === id)?.name ?? "Vị đã xoá";
      return n > 1 ? `${name} ×${n}` : name;
    })
    .join(" · ");
};

const demoItems = (p: PickLine): string =>
  `${p.comboName}${p.qty > 1 ? ` ×${p.qty}` : ""} (${describeIds(p.flavorIds, p.pool)})`;

function demoData(): ManageRow[] {
  if (demoRows) return demoRows;
  const mk = (
    i: number,
    code: string,
    status: string,
    name: string,
    phone: string,
    address: string,
    date: string,
    items: string,
    amount: number,
    note = "",
    vc = "",
  ): ManageRow => ({
    shipmentId: `demo-${i}`,
    recipientId: `demo-r-${i}`,
    orderCode: code,
    display: code,
    createdAtIso: new Date(Date.now() - i * 86_400_000).toISOString(),
    paymentStatus: status === "Mới" ? "pending" : "paid",
    currency: "krw",
    status,
    editable: EDITABLE_STATUS.has(status),
    name,
    phone,
    address,
    region: "kr",
    desiredDate: date,
    items,
    carrier: vc ? "CJ" : "",
    vc,
    note,
    amount,
  });
  const pick = (i: number, comboName: string, qty: number, flavorIds: string[]): PickLine => ({
    lineId: `demo-l-${i}`,
    comboName,
    qty,
    pickCount: 4,
    pool: DEMO_POOL,
    flavorIds,
  });
  const p1 = pick(1, "Kim Ngọc Các", 2, ["f4", "f4", "f5", "f1"]);
  const p2 = pick(2, "Vinh Hiển", 1, ["f1", "f6", "f5", "f4"]);
  const p4 = pick(4, "Kim Ngọc Các", 1, ["f4", "f5", "f1", "f6"]);
  demoRows = [
    mk(1, "DK0101", "Mới", "Kim Min Ji", "010-2233-4455", "Seoul, Yongsan-gu, Hangang-daero 84-gil 21", "2026-09-18", demoItems(p1), 126000, "Khách của bên em"),
    mk(2, "DK0102", "Đã xác nhận", "Lê Thu Trang", "010-8899-1122", "Ansan, Danwon-gu, Seonbu-dong 123", "2026-09-20", demoItems(p2), 55000),
    mk(3, "DK0103", "Đang đóng hàng", "Park Ji Won", "010-5566-7788", "Suwon, Yeongtong-gu, Gwanggyo-ro 145", "2026-09-21", "Sắc Đỏ ×3", 117000, "Tặng kèm thiệp"),
    mk(4, "DK0104", "Đã gửi hàng", "Nguyễn Hoài An", "010-3344-5566", "Busan, Haeundae-gu, Centum 2-ro 25", "2026-09-15", demoItems(p4), 63000, "", "CJ-771888"),
  ];
  demoRows[0].picks = [p1];
  demoRows[1].picks = [p2];
  demoRows[3].picks = [p4];
  return demoRows;
}

// ---- đọc: mọi kiện của mọi đơn mà SĐT này là NGƯỜI ĐẶT ---------------------
export async function findManagedOrders(rawPhone: string): Promise<ManageResult> {
  if (!isServiceRoleConfigured) return { configured: false, rows: demoData() };

  const candidates = phoneCandidates(rawPhone);
  if (!candidates.length) return { configured: true, rows: [] };

  const sb = getServiceClient();
  const { data: customers, error: cErr } = await sb
    .from("customer")
    .select("id")
    .in("phone", [...new Set(candidates)]);
  if (cErr) throw new Error(`Không tra cứu được: ${cErr.message}`);
  if (!customers?.length) return { configured: true, rows: [] };

  const ids = (customers as { id: string }[]).map((c) => c.id);
  const { data, error } = await sb
    .from("web_order")
    .select(
      `id, code, currency, payment_status, created_at,
       shipment ( id, status, carrier, vc_code, fulfillment_region, product_summary,
                  note, cod, prepaid, parcel_index, parcel_count,
                  recipient ( id, name, phone, address, desired_date ) ),
       order_line ( id, recipient_id, kind, combo_id, flavors, qty )`,
    )
    .in("customer_id", ids)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Không tra cứu được: ${error.message}`);

  type Row = {
    code: string;
    currency: Currency;
    payment_status: string;
    created_at: string;
    shipment: {
      id: string;
      status: string | null;
      carrier: string | null;
      vc_code: string | null;
      fulfillment_region: Region;
      product_summary: string | null;
      note: string | null;
      cod: number | null;
      prepaid: number | null;
      parcel_index: number | null;
      parcel_count: number | null;
      recipient: {
        id: string;
        name: string | null;
        phone: string | null;
        address: string | null;
        desired_date: string | null;
      } | null;
    }[];
    order_line: {
      id: string;
      recipient_id: string | null;
      kind: string;
      combo_id: string | null;
      flavors: string[] | null;
      qty: number;
    }[];
  };
  const orders = (data ?? []) as unknown as Row[];

  // Tra một lượt tên + ruột của các set tự chọn xuất hiện trong đơn — để dựng
  // bảng đổi vị mà không phải gọi lặp từng dòng.
  const comboIds = [
    ...new Set(orders.flatMap((o) => o.order_line ?? []).map((l) => l.combo_id).filter(Boolean)),
  ] as string[];
  const comboMap = new Map<string, { name: string; flavor_ids: string[]; pick_count: number }>();
  if (comboIds.length) {
    const { data: cs } = await sb.from("combo").select("id, name, flavor_ids, pick_count").in("id", comboIds);
    for (const c of (cs ?? []) as { id: string; name: string; flavor_ids: string[] | null; pick_count: number | null }[])
      comboMap.set(c.id, { name: c.name, flavor_ids: c.flavor_ids ?? [], pick_count: c.pick_count ?? 0 });
  }
  const poolFlavorIds = [...new Set([...comboMap.values()].flatMap((c) => c.flavor_ids))];
  const flavorName = new Map<string, string>();
  if (poolFlavorIds.length) {
    const { data: fs } = await sb.from("flavor").select("id, name, short_name").in("id", poolFlavorIds);
    for (const f of (fs ?? []) as { id: string; name: string; short_name: string | null }[])
      flavorName.set(f.id, f.short_name?.trim() || f.name);
  }

  const rows: ManageRow[] = [];
  for (const o of orders) {
    for (const s of o.shipment ?? []) {
      const status = s.status || "Mới";
      // các dòng SET TỰ CHỌN VỊ thuộc kiện này (kiện = người nhận)
      const picks: PickLine[] = (o.order_line ?? [])
        .filter((l) => l.recipient_id === s.recipient?.id && l.kind === "combo" && l.combo_id)
        .flatMap((l) => {
          const c = comboMap.get(l.combo_id!);
          if (!c || !c.pick_count) return [];
          return [
            {
              lineId: l.id,
              comboName: c.name,
              qty: l.qty,
              pickCount: c.pick_count,
              pool: c.flavor_ids.map((id) => ({ id, name: flavorName.get(id) ?? "Vị đã xoá" })),
              flavorIds: (l.flavors ?? []).filter(Boolean),
            },
          ];
        });
      rows.push({
        shipmentId: s.id,
        recipientId: s.recipient?.id ?? "",
        orderCode: o.code,
        display:
          (s.parcel_count ?? 1) > 1 ? `${o.code}-${s.parcel_index ?? 1}` : o.code,
        createdAtIso: o.created_at,
        paymentStatus: o.payment_status,
        currency: o.currency,
        status,
        editable: EDITABLE_STATUS.has(status),
        name: s.recipient?.name ?? "",
        phone: s.recipient?.phone ?? "",
        address: s.recipient?.address ?? "",
        region: s.fulfillment_region,
        desiredDate: s.recipient?.desired_date ?? "",
        items: s.product_summary ?? "",
        carrier: s.carrier ?? "",
        vc: s.vc_code ?? "",
        note: s.note ?? "",
        amount: (s.cod ?? 0) + (s.prepaid ?? 0),
        picks: picks.length ? picks : undefined,
      });
    }
  }
  return { configured: true, rows };
}

// ---- sửa: một kiện, khi còn trong tay shop ---------------------------------
export interface ManageEdit {
  name: string;
  phone: string;
  address: string;
  desiredDate: string;
  note: string;
  /** Đổi ruột các set tự chọn vị: mỗi phần tử là một dòng đơn + bộ vị mới. */
  picks?: { lineId: string; flavorIds: string[] }[];
}

export interface ManageUpdateOk {
  ok: true;
  /** Chuỗi sản phẩm mới của kiện sau khi đổi vị — client cập nhật tại chỗ. */
  items?: string;
}

export async function updateManagedParcel(
  rawPhone: string,
  shipmentId: string,
  edit: ManageEdit,
): Promise<ManageUpdateOk | { ok: false; error: string; locked?: boolean }> {
  const name = edit.name?.trim() ?? "";
  const address = edit.address?.trim() ?? "";
  if (!name || !address) return { ok: false, error: "Tên và địa chỉ người nhận không được bỏ trống." };
  if (edit.desiredDate && !/^\d{4}-\d{2}-\d{2}$/.test(edit.desiredDate))
    return { ok: false, error: "Ngày hẹn giao không hợp lệ." };

  if (!isServiceRoleConfigured) {
    // chế độ xem thử: sửa thẳng bộ đơn mẫu trong bộ nhớ
    const row = demoData().find((r) => r.shipmentId === shipmentId);
    if (!row) return { ok: false, error: "Không thấy kiện này." };
    if (!row.editable)
      return { ok: false, locked: true, error: "Kiện đang giao — không sửa được nữa, nhắn shop giúp em." };
    for (const p of edit.picks ?? []) {
      const line = (row.picks ?? []).find((x) => x.lineId === p.lineId);
      if (!line) return { ok: false, error: "Không thấy món cần đổi vị trong kiện này." };
      const picked = (p.flavorIds ?? []).filter(Boolean);
      if (picked.length !== line.pickCount)
        return { ok: false, error: `Set "${line.comboName}" cần chọn đúng ${line.pickCount} vị (đang ${picked.length}).` };
      if (picked.some((id) => !line.pool.some((f) => f.id === id)))
        return { ok: false, error: `Có vị không nằm trong danh sách của set "${line.comboName}".` };
      line.flavorIds = picked;
    }
    if (edit.picks?.length) row.items = (row.picks ?? []).map(demoItems).join(", ");
    Object.assign(row, {
      name,
      address,
      phone: edit.phone?.trim() ?? row.phone,
      desiredDate: edit.desiredDate ?? "",
      note: edit.note?.trim() ?? "",
    });
    return { ok: true, items: edit.picks?.length ? row.items : undefined };
  }

  const candidates = phoneCandidates(rawPhone);
  if (!candidates.length) return { ok: false, error: "SĐT không hợp lệ." };

  const sb = getServiceClient();
  // Kiện phải thuộc một đơn mà SĐT này là NGƯỜI ĐẶT — không thì coi như không
  // tồn tại, không lộ cả việc mã kiện có thật hay không.
  const { data: sh, error: sErr } = await sb
    .from("shipment")
    .select(
      `id, status, recipient_id, note, tags, fulfillment_region,
       web_order ( customer ( phone ) )`,
    )
    .eq("id", shipmentId)
    .maybeSingle();
  if (sErr) return { ok: false, error: `Không sửa được: ${sErr.message}` };
  type Sh = {
    id: string;
    status: string | null;
    recipient_id: string;
    note: string | null;
    tags: string[] | null;
    fulfillment_region: Region;
    web_order: { customer: { phone: string | null } | null } | null;
  };
  const ship = sh as unknown as Sh | null;
  const ownerPhone = ship?.web_order?.customer?.phone ?? "";
  if (!ship || !candidates.includes(ownerPhone))
    return { ok: false, error: "Không thấy kiện này trong các đơn của số máy anh/chị." };

  // KHOÁ khi hàng đã rời tay shop — kiểm ở MÁY CHỦ, giao diện chỉ là lớp vỏ.
  if (!EDITABLE_STATUS.has(ship.status || "Mới"))
    return {
      ok: false,
      locked: true,
      error: `Kiện đang ở bước "${ship.status}" — không sửa được nữa, nhắn shop giúp em.`,
    };

  // --- đổi vị các set tự chọn (nếu có) — kiểm ở máy chủ y như lúc đặt ---
  let newSummary: string | undefined;
  if (edit.picks?.length) {
    for (const p of edit.picks) {
      const { data: line, error: lErr } = await sb
        .from("order_line")
        .select("id, recipient_id, kind, combo_id")
        .eq("id", p.lineId)
        .maybeSingle();
      if (lErr) return { ok: false, error: `Không sửa được: ${lErr.message}` };
      const ln = line as { id: string; recipient_id: string | null; kind: string; combo_id: string | null } | null;
      if (!ln || ln.recipient_id !== ship.recipient_id || ln.kind !== "combo" || !ln.combo_id)
        return { ok: false, error: "Không thấy món cần đổi vị trong kiện này." };
      const { data: combo } = await sb
        .from("combo")
        .select("name, flavor_ids, pick_count")
        .eq("id", ln.combo_id)
        .maybeSingle();
      const c = combo as { name: string; flavor_ids: string[] | null; pick_count: number | null } | null;
      const need = c?.pick_count ?? 0;
      if (!c || !need) return { ok: false, error: "Món này không phải set tự chọn vị." };
      const picked = (p.flavorIds ?? []).filter(Boolean);
      if (picked.length !== need)
        return { ok: false, error: `Set "${c.name}" cần chọn đúng ${need} vị (đang ${picked.length}).` };
      if (picked.some((id) => !(c.flavor_ids ?? []).includes(id)))
        return { ok: false, error: `Có vị không nằm trong danh sách của set "${c.name}".` };
      const { error: uErr } = await sb.from("order_line").update({ flavors: picked }).eq("id", ln.id);
      if (uErr) return { ok: false, error: `Không sửa được: ${uErr.message}` };
    }

    // Dựng lại chuỗi sản phẩm của KIỆN từ các dòng đơn — bên đóng gói đọc chuỗi
    // này để nhét bánh vào hộp, để cũ là đóng SAI VỊ. Chỉ dựng lại khi có đổi
    // vị (đơn rất cũ kiểu "· loại nhân" không lưu tên lựa chọn trong dòng đơn,
    // đụng vào là mất chữ đó).
    const { data: allLines } = await sb
      .from("order_line")
      .select("kind, combo_id, box_id, flavors, qty")
      .eq("recipient_id", ship.recipient_id);
    type Ln = { kind: string; combo_id: string | null; box_id: string | null; flavors: string[] | null; qty: number };
    const lines = (allLines ?? []) as Ln[];
    const comboIds = [...new Set(lines.map((l) => l.combo_id).filter(Boolean))] as string[];
    const comboMap = new Map<string, { name: string; pick_count: number }>();
    if (comboIds.length) {
      const { data: cs } = await sb.from("combo").select("id, name, pick_count").in("id", comboIds);
      for (const c of (cs ?? []) as { id: string; name: string; pick_count: number | null }[])
        comboMap.set(c.id, { name: c.name, pick_count: c.pick_count ?? 0 });
    }
    const fIds = [...new Set(lines.flatMap((l) => l.flavors ?? []))];
    const fName = new Map<string, string>();
    if (fIds.length) {
      const { data: fs } = await sb.from("flavor").select("id, name, short_name").in("id", fIds);
      for (const f of (fs ?? []) as { id: string; name: string; short_name: string | null }[])
        fName.set(f.id, f.short_name?.trim() || f.name);
    }
    newSummary = lines
      .map((l) => {
        const times = l.qty > 1 ? ` ×${l.qty}` : "";
        if (l.kind === "la") return `${fName.get(l.flavors?.[0] ?? "") ?? "Bánh lẻ"}${times}`;
        if (l.kind === "combo") {
          const c = l.combo_id ? comboMap.get(l.combo_id) : undefined;
          const pick = c?.pick_count
            ? ` (${describeIds(l.flavors ?? [], [...fName.entries()].map(([id, nm]) => ({ id, name: nm })))})`
            : "";
          return `${c?.name ?? "Set"}${times}${pick}`;
        }
        const vi = (l.flavors ?? []).map((id) => fName.get(id)).filter(Boolean).join(", ");
        return `Hộp tự chọn${times}${vi ? ` (${vi})` : ""}`;
      })
      .join(", ");
  }

  const recPhone = normalizePhone(edit.phone ?? "", ship.fulfillment_region) ?? edit.phone?.trim() ?? "";
  const { error: rErr } = await sb
    .from("recipient")
    .update({
      name,
      phone: recPhone,
      address,
      desired_date: edit.desiredDate || null,
    })
    .eq("id", ship.recipient_id);
  if (rErr) return { ok: false, error: `Không sửa được: ${rErr.message}` };

  // Gắn nhãn để bên đóng gói biết đơn vừa được người đặt sửa lại.
  const tags = ship.tags ?? [];
  const { error: nErr } = await sb
    .from("shipment")
    .update({
      note: edit.note?.trim() ?? "",
      tags: tags.includes("Khách sửa") ? tags : [...tags, "Khách sửa"],
      ...(newSummary !== undefined ? { product_summary: newSummary } : {}),
    })
    .eq("id", ship.id);
  if (nErr) return { ok: false, error: `Không sửa được: ${nErr.message}` };

  return { ok: true, items: newSummary };
}
