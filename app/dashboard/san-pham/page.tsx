import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import { getAllProducts } from "@/lib/products/productStore";
import ProductsAdmin from "@/components/ProductsAdmin";

export const metadata = { title: "Doran King — Sản phẩm" };
export const dynamic = "force-dynamic"; // sửa sản phẩm xong tải lại là thấy ngay

export default async function SanPhamAdmin() {
  // Trang quản trị cần thấy CẢ hàng đang tắt bán và hàng trong thùng rác, nên
  // không dùng chung hàm với trang bán cho khách. Chưa nối DB thì lùi về danh
  // mục mẫu để vẫn xem thử được giao diện.
  const all = await getAllProducts();
  const [boxes, flavors, combos] = all
    ? [all.boxes, all.flavors, all.combos]
    : await Promise.all([getBoxes(), getFlavors(), getCombos()]);

  return (
    <ProductsAdmin boxes={boxes} flavors={flavors} combos={combos} connected={Boolean(all)} />
  );
}
