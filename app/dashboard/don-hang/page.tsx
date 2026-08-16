import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import { getAllProducts } from "@/lib/products/productStore";
import { getFacebookPageId } from "@/lib/orders/links";
import OrdersTable from "@/components/OrdersTable";

export const metadata = { title: "Doran King — Quản lý đơn hàng" };
export const dynamic = "force-dynamic"; // sửa danh mục xong tạo đơn là thấy ngay

export default async function DonHangPage() {
  // Form "Tạo đơn" cần danh mục THẬT để tính tiền và trừ kho đúng. Trước đây nó
  // dựng trên bảng hardcode của menu cũ nên đơn tạo tay ghi tên hàng không tồn
  // tại và không trừ kho được.
  const [all, fbPageId] = await Promise.all([getAllProducts(), getFacebookPageId()]);
  const [boxes, flavors, combos] = all
    ? [all.boxes, all.flavors, all.combos]
    : await Promise.all([getBoxes(), getFlavors(), getCombos()]);

  return <OrdersTable boxes={boxes} flavors={flavors} combos={combos} fbPageId={fbPageId} />;
}
