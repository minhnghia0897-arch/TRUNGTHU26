import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import { getAllProducts } from "@/lib/products/productStore";
import { getFacebookPageId } from "@/lib/orders/links";
import CustomersView from "@/components/CustomersView";

export const metadata = { title: "Doran King — Khách hàng" };
export const dynamic = "force-dynamic";

export default async function KhachHangPage() {
  // Trang này mở CÙNG popup chi tiết đơn với trang Đơn hàng, nên cần đúng những
  // gì popup đó cần: Page ID để mở cuộc chat, và danh mục để sửa được hàng trong
  // đơn. Thiếu danh mục thì popup không gọi được tên món, cũng không thêm được.
  const [all, fbPageId] = await Promise.all([getAllProducts(), getFacebookPageId()]);
  const [boxes, flavors, combos] = all
    ? [all.boxes, all.flavors, all.combos]
    : await Promise.all([getBoxes(), getFlavors(), getCombos()]);

  return (
    <CustomersView boxes={boxes} flavors={flavors} combos={combos} fbPageId={fbPageId} />
  );
}
