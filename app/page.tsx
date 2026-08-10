import { redirect } from "next/navigation";

// Cổng chọn đã bỏ — bộ sưu tập (/san-pham) là trang chính thức.
// Luồng doanh nghiệp đi thẳng /doanh-nghiep (2 luồng vẫn tách biệt).
export default function Home() {
  redirect("/san-pham");
}
