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
  demoRows = [
    mk(1, "DK0101", "Mới", "Kim Min Ji", "010-2233-4455", "Seoul, Yongsan-gu, Hangang-daero 84-gil 21", "2026-09-18", "Kim Ngọc Các ×2", 126000, "Khách của bên em"),
    mk(2, "DK0102", "Đã xác nhận", "Lê Thu Trang", "010-8899-1122", "Ansan, Danwon-gu, Seonbu-dong 123", "2026-09-20", "Vinh Hiển ×1", 55000),
    mk(3, "DK0103", "Đang đóng hàng", "Park Ji Won", "010-5566-7788", "Suwon, Yeongtong-gu, Gwanggyo-ro 145", "2026-09-21", "Sắc Đỏ ×3", 117000, "Tặng kèm thiệp"),
    mk(4, "DK0104", "Đã gửi hàng", "Nguyễn Hoài An", "010-3344-5566", "Busan, Haeundae-gu, Centum 2-ro 25", "2026-09-15", "Kim Ngọc Các ×1", 63000, "", "CJ-771888"),
  ];
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
                  recipient ( id, name, phone, address, desired_date ) )`,
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
  };

  const rows: ManageRow[] = [];
  for (const o of (data ?? []) as unknown as Row[]) {
    for (const s of o.shipment ?? []) {
      const status = s.status || "Mới";
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
}

export async function updateManagedParcel(
  rawPhone: string,
  shipmentId: string,
  edit: ManageEdit,
): Promise<{ ok: true } | { ok: false; error: string; locked?: boolean }> {
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
    Object.assign(row, {
      name,
      address,
      phone: edit.phone?.trim() ?? row.phone,
      desiredDate: edit.desiredDate ?? "",
      note: edit.note?.trim() ?? "",
    });
    return { ok: true };
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
    })
    .eq("id", ship.id);
  if (nErr) return { ok: false, error: `Không sửa được: ${nErr.message}` };

  return { ok: true };
}
