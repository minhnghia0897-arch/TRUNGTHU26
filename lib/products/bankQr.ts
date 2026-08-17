import { getServiceClient, isServiceRoleConfigured } from "@/lib/supabase/server";

// ============================================================================
// Ảnh mã QR ngân hàng Việt Nam — CHỈ CHẠY Ở SERVER.
//
// Vì sao cần lưu ảnh riêng thay vì cứ dựng QR từ VietQR:
// shop muốn dùng đúng ảnh QR chính chủ xuất từ app ngân hàng (có logo MB, dấu
// napas 247) — khách quen mặt cái đó hơn ảnh mình tự sinh.
//
// ĐÁNH ĐỔI PHẢI BIẾT: ảnh tĩnh KHÔNG mang số tiền. QR tự sinh có `?amount=` nên
// khách quét là hiện sẵn số phải trả; dùng ảnh tĩnh thì khách tự gõ số tiền.
// Chỗ hiển thị phải nói rõ điều này, không để khách tưởng đã điền sẵn.
//
// Không cấu hình thì trả rỗng và trang thanh toán tự lùi về QR sinh động.
// ============================================================================

const KEY = "bank_qr_vn";

export async function getBankQrVn(): Promise<string> {
  if (!isServiceRoleConfigured) return "";
  try {
    const sb = getServiceClient();
    const { data } = await sb.from("app_config").select("value").eq("key", KEY).maybeSingle();
    return String((data?.value as { url?: string } | undefined)?.url ?? "");
  } catch {
    return ""; // lỗi đọc cấu hình không được chặn trang đặt hàng
  }
}

export async function setBankQrVn(url: string) {
  if (!isServiceRoleConfigured) throw new Error("Chưa nối cơ sở dữ liệu.");
  const sb = getServiceClient();
  const { error } = await sb
    .from("app_config")
    .upsert({ key: KEY, value: { url: url.trim() } }, { onConflict: "key" });
  if (error) throw new Error(`Không lưu được mã QR: ${error.message}`);
}
