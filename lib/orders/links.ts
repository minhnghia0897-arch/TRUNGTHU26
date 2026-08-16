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
 * Token do shop tạo tay có dạng `fb-…`. Mọi giá trị khác là mã khách do
 * Pancake/Botcake điền vào link mẫu `?ref={{customer_id}}`.
 */
export const isOwnToken = (ref: string) => ref.startsWith("fb-");

/**
 * Chuẩn hoá `?ref` trước khi dùng. Trả chuỗi rỗng nếu không dùng được.
 *
 * BÓC DẤU `{{ }}`. Link mẫu ghi `?ref={{customer_id}}` để Botcake tự thay; làm
 * tay thì người ta thay chữ `customer_id` bằng con số mà GIỮ LẠI cặp ngoặc.
 * Giá trị `{{100004694974216}}` chui thẳng vào database, rồi link mở chat thành
 * `selected_item_id=%7B%7B…%7D%7D` — Facebook không đọc được nên mở hộp thư
 * chung. Đúng lỗi đã gặp.
 *
 * LOẠI BIẾN CHƯA THAY. Botcake không thay thì ref là chữ `customer_id`. Nhận
 * bừa thì sinh ra một "khách" tên customer_id dùng chung cho mọi người — tệ hơn
 * là không nhận. Nên ngoài token `fb-…` của mình, chỉ nhận chuỗi toàn chữ số.
 */
export function normalizeRef(raw?: string): string {
  let v = (raw ?? "").trim();
  while (v.startsWith("{")) v = v.slice(1);
  while (v.endsWith("}")) v = v.slice(0, -1);
  v = v.trim();
  if (!v) return "";
  if (isOwnToken(v)) return v;
  return /^\d+$/.test(v) ? v : "";
}

/**
 * Tra `?ref` lúc khách đặt hàng.
 *
 * Nhận CẢ HAI đường vào, vì trang Messenger khuyên dùng link mẫu để Pancake tự
 * điền mã — bản đầu chỉ tra theo token do shop tạo tay nên đơn đặt qua link mẫu
 * mất sạch dấu vết:
 *   1. token `fb-…` do shop tạo
 *   2. mã khách Pancake, hoặc PSID
 *
 * Trả `null` khi không khớp gì — đơn vẫn chạy bình thường.
 */
export async function findLink(rawRef?: string): Promise<OrderLink | null> {
  const ref = normalizeRef(rawRef);
  if (!ref || !isServiceRoleConfigured) return null;
  const sb = getServiceClient();
  const { data } = await sb
    .from("order_links")
    .select(COLS)
    .or(`token.eq.${ref},psid.eq.${ref},pancake_customer_id.eq.${ref}`)
    .limit(1)
    .maybeSingle();
  return data ? toLink(data as unknown as LinkRow) : null;
}

/**
 * Ghi nhận một khách CHƯA TỪNG BIẾT đến từ link mẫu.
 *
 * Với link mẫu thì shop không tạo link trước, nên lần đầu khách đặt là lần đầu
 * mình thấy mã của họ. Tạo sẵn một dòng để khách hiện ra ở trang Messenger và
 * shop đặt tên lại được — không thì mã đó trôi đi, lần sau vẫn không biết ai.
 *
 * Mã Pancake điền vào thường chính là PSID nên lưu vào cả `psid` để dựng được
 * đường dẫn mở cuộc chat; sai thì shop sửa lại ở trang Messenger.
 */
export async function registerRefIfNew(rawRef: string, buyerName: string): Promise<OrderLink | null> {
  const ref = normalizeRef(rawRef);
  if (!ref || !isServiceRoleConfigured || isOwnToken(ref)) return null;
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("order_links")
    .insert({
      token: ref,
      customer_name: buyerName.trim() || "Khách Messenger",
      psid: ref,
      pancake_customer_id: ref,
      used: true,
    })
    .select(COLS)
    .single();
  if (error) return null; // trùng khoá = đã có, không sao
  return toLink(data as unknown as LinkRow);
}

/**
 * Đánh dấu token đã sinh ra đơn nào.
 *
 * Lỗi ở đây KHÔNG được làm hỏng đơn — đơn đã ghi xong rồi, ném lỗi chỉ khiến
 * khách tưởng đặt thất bại và đặt lại lần nữa.
 */
export async function markLinkUsed(rawToken: string, orderCode: string) {
  const token = normalizeRef(rawToken);
  if (!token || !isServiceRoleConfigured) return;
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
