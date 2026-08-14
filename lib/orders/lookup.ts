import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import type { Currency, Region } from "@/lib/types";

// ============================================================================
// Tra cứu đơn theo SĐT, không cần đăng nhập (§10.4).
//
// CHỈ trả những gì khách cần để theo dõi. Không trả địa chỉ đầy đủ của người
// nhận, không trả SĐT — biết một số điện thoại là dò được cả danh bạ thì hỏng.
// ============================================================================

export const isLookupConfigured = () => isServiceRoleConfigured;

export interface LookupParcel {
  recipient: string;
  region: Region;
  status: string;
  carrier: string;
  vc: string;
  desiredDate: string;
  items: string;
}

export interface LookupOrder {
  code: string;
  transferCode: string;
  currency: Currency;
  grandTotal: number;
  paymentStatus: string;
  createdAtIso: string;
  parcels: LookupParcel[];
}

/** Che bớt địa chỉ: chỉ giữ phần cuối (tỉnh/thành) để khách nhận ra đơn của mình. */
const maskName = (s: string) => {
  const t = (s ?? "").trim();
  if (t.length <= 2) return t;
  const parts = t.split(/\s+/);
  if (parts.length === 1) return `${t.slice(0, 1)}${"*".repeat(Math.max(1, t.length - 1))}`;
  return parts.map((p, i) => (i === parts.length - 1 ? p : `${p.slice(0, 1)}.`)).join(" ");
};

export async function findOrdersByPhone(rawPhone: string): Promise<LookupOrder[]> {
  if (!isLookupConfigured()) return [];

  // Khách có thể gõ 010-xxxx (Hàn) hay 09xx (VN) — thử chuẩn hoá cả hai chiều.
  const candidates = [
    normalizePhone(rawPhone, "kr"),
    normalizePhone(rawPhone, "vn"),
    rawPhone.trim(),
  ].filter((x): x is string => Boolean(x));
  if (!candidates.length) return [];

  const sb = getServiceClient();

  const { data: customers, error: cErr } = await sb
    .from("customer")
    .select("id")
    .in("phone", [...new Set(candidates)]);
  if (cErr) throw new Error(`Không tra cứu được: ${cErr.message}`);
  if (!customers?.length) return [];

  const ids = (customers as { id: string }[]).map((c) => c.id);

  const { data, error } = await sb
    .from("web_order")
    .select(
      `code, transfer_code, currency, grand_total, payment_status, created_at,
       shipment ( status, carrier, vc_code, fulfillment_region, product_summary,
                  recipient ( name, desired_date ) )`,
    )
    .in("customer_id", ids)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Không tra cứu được: ${error.message}`);

  type Row = {
    code: string;
    transfer_code: string;
    currency: Currency;
    grand_total: number;
    payment_status: string;
    created_at: string;
    shipment: {
      status: string | null;
      carrier: string | null;
      vc_code: string | null;
      fulfillment_region: Region;
      product_summary: string | null;
      recipient: { name: string | null; desired_date: string | null } | null;
    }[];
  };

  return ((data ?? []) as unknown as Row[]).map((o) => ({
    code: o.code,
    transferCode: o.transfer_code,
    currency: o.currency,
    grandTotal: o.grand_total,
    paymentStatus: o.payment_status,
    createdAtIso: o.created_at,
    parcels: (o.shipment ?? []).map((s) => ({
      recipient: maskName(s.recipient?.name ?? ""),
      region: s.fulfillment_region,
      status: s.status || "Mới",
      carrier: s.carrier ?? "",
      vc: s.vc_code ?? "",
      desiredDate: s.recipient?.desired_date ?? "",
      items: s.product_summary ?? "",
    })),
  }));
}
