import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";

// ============================================================================
// Link truy vết khách Messenger — CHỈ CHẠY Ở SERVER.
//
// Bản cũ lưu link vào localStorage của máy chủ shop. Khách bấm link thì trang
// mở trên MÁY CỦA KHÁCH, nơi localStorage rỗng — nên tra token luôn không ra và
// tính năng chưa bao giờ gắn đúng khách. Nay token nằm trong database, máy chủ
// tra lúc tạo đơn.
// ============================================================================

export interface OrderLink {
  token: string;
  customerName: string;
  psid: string;
  phone?: string;
  pancakeCustomerId?: string;
  createdAt: string;
  usedByOrder?: string;
}

interface LinkRow {
  token: string;
  customer_name: string | null;
  psid: string | null;
  phone: string | null;
  pancake_customer_id: string | null;
  created_at: string;
  used_by_order: string | null;
}

const toLink = (r: LinkRow): OrderLink => ({
  token: r.token,
  customerName: r.customer_name ?? "Khách Messenger",
  psid: r.psid ?? "",
  phone: r.phone ?? undefined,
  pancakeCustomerId: r.pancake_customer_id ?? undefined,
  createdAt: r.created_at,
  usedByOrder: r.used_by_order ?? undefined,
});

const COLS = "token, customer_name, psid, phone, pancake_customer_id, created_at, used_by_order";

// ---------------------------------------------------------- Page Facebook
/**
 * ID Trang Facebook, lưu trong app_config.
 *
 * PSID (Page-Scoped ID) chỉ có nghĩa TRONG hộp thư của đúng Trang đó — không
 * có Page ID thì không dựng được đường dẫn mở cuộc chat, chỉ biết tên khách.
 */
export async function getFacebookPageId(): Promise<string> {
  if (!isServiceRoleConfigured) return "";
  const sb = getServiceClient();
  const { data } = await sb
    .from("app_config")
    .select("value")
    .eq("key", "facebook_page")
    .maybeSingle();
  return String((data?.value as { page_id?: string } | undefined)?.page_id ?? "");
}

export async function setFacebookPageId(pageId: string) {
  if (!isServiceRoleConfigured) throw new Error("Chưa nối cơ sở dữ liệu.");
  const sb = getServiceClient();
  const { error } = await sb
    .from("app_config")
    .upsert({ key: "facebook_page", value: { page_id: pageId.trim() } }, { onConflict: "key" });
  if (error) throw new Error(`Không lưu được Page ID: ${error.message}`);
}

/** Token dạng fb-<mã> để nhìn là biết nguồn. */
export const genToken = () =>
  `fb-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function listLinks(): Promise<OrderLink[]> {
  if (!isServiceRoleConfigured) return [];
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("order_links")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Không đọc được link: ${error.message}`);
  return ((data ?? []) as unknown as LinkRow[]).map(toLink);
}

export async function addLink(input: {
  customerName: string;
  psid?: string;
  phone?: string;
}): Promise<OrderLink> {
  if (!isServiceRoleConfigured) throw new Error("Chưa nối cơ sở dữ liệu.");
  const sb = getServiceClient();
  const row = {
    token: genToken(),
    customer_name: input.customerName.trim() || "Khách Messenger",
    psid: input.psid?.trim() || null,
    phone: input.phone?.trim() || null,
    used: false,
  };
  const { data, error } = await sb.from("order_links").insert(row).select(COLS).single();
  if (error || !data) throw new Error(`Không tạo được link: ${error?.message ?? ""}`);
  return toLink(data as unknown as LinkRow);
}

export async function removeLink(token: string) {
  if (!isServiceRoleConfigured) throw new Error("Chưa nối cơ sở dữ liệu.");
  const sb = getServiceClient();
  const { error } = await sb.from("order_links").delete().eq("token", token);
  if (error) throw new Error(`Không xoá được link: ${error.message}`);
}

/**
 * Tra token lúc khách đặt hàng. Trả `null` nếu token không có thật — đơn vẫn
 * chạy bình thường, chỉ là không gắn được khách.
 */
export async function findLink(token?: string): Promise<OrderLink | null> {
  if (!token || !isServiceRoleConfigured) return null;
  const sb = getServiceClient();
  const { data } = await sb.from("order_links").select(COLS).eq("token", token).maybeSingle();
  return data ? toLink(data as unknown as LinkRow) : null;
}

/**
 * Đánh dấu token đã sinh ra đơn nào.
 *
 * Lỗi ở đây KHÔNG được làm hỏng đơn — đơn đã ghi xong rồi, ném lỗi chỉ khiến
 * khách tưởng đặt thất bại và đặt lại lần nữa.
 */
export async function markLinkUsed(token: string, orderCode: string) {
  if (!isServiceRoleConfigured) return;
  try {
    const sb = getServiceClient();
    await sb
      .from("order_links")
      .update({ used: true, used_by_order: orderCode })
      .eq("token", token);
  } catch (e) {
    console.error("LINK_MARK_USED_FAILED", token, e);
  }
}
