import { redirect } from "next/navigation";

// Trang chủ khách lẻ cũ đã bỏ — bộ sưu tập (/san-pham) là trang chính của luồng lẻ.
// Giữ route này để link/bookmark cũ vẫn vào được.
export default function LeRedirect() {
  redirect("/san-pham");
}
