import { getFacebookPageId } from "@/lib/orders/links";
import CustomersView from "@/components/CustomersView";

export const metadata = { title: "Doran King — Khách hàng" };
export const dynamic = "force-dynamic";

export default async function KhachHangPage() {
  // Trang này mở CÙNG popup chi tiết đơn với trang Đơn hàng, nên cũng cần Page
  // ID — thiếu là nút mở cuộc chat biến mất khi xem đơn từ đây.
  const fbPageId = await getFacebookPageId();
  return <CustomersView fbPageId={fbPageId} />;
}
