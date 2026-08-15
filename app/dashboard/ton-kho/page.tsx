import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import { getAllProducts } from "@/lib/products/productStore";
import InventoryView from "@/components/InventoryView";

export const metadata = { title: "Doran King — Tồn kho" };
export const dynamic = "force-dynamic"; // sửa tồn xong tải lại là thấy ngay

export default async function TonKhoPage() {
  // Cùng nguồn với trang Sản phẩm: tồn kho nằm trên chính bản ghi sản phẩm
  // (§0012), không còn bảng kho riêng lưu ở trình duyệt.
  const all = await getAllProducts();
  const [boxes, flavors, combos] = all
    ? [all.boxes, all.flavors, all.combos]
    : await Promise.all([getBoxes(), getFlavors(), getCombos()]);

  return (
    <InventoryView boxes={boxes} flavors={flavors} combos={combos} connected={Boolean(all)} />
  );
}
