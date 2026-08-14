import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client cho server-side.
 * - Đọc danh mục công khai: dùng anon key (RLS chỉ cho đọc active).
 * - Ghi/đọc bảng đơn: dùng service role (bypass RLS) — CHỈ ở server (§4.3).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Đã đủ điều kiện thao tác bảng đơn chưa (cần service role).
 * Tách khỏi `isSupabaseConfigured` vì đọc danh mục chỉ cần anon key, còn
 * đọc/ghi đơn bắt buộc service role (§4.3 — bảng đơn không mở cho client).
 */
export const isServiceRoleConfigured = Boolean(url && serviceKey);

/** Client đọc danh mục (anon). Trả null nếu chưa cấu hình → caller fallback seed. */
export function getPublicClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

/** Client service role — chỉ dùng trong API route / server action cho bảng đơn. */
export function getServiceClient(): SupabaseClient {
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY chưa cấu hình — không thao tác được bảng đơn.",
    );
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
