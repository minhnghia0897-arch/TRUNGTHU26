import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import ProductsAdmin from "@/components/ProductsAdmin";

export const metadata = { title: "Doran King — Sản phẩm" };

export default async function SanPhamAdmin() {
  const [boxes, flavors, combos] = await Promise.all([getBoxes(), getFlavors(), getCombos()]);
  // Tồn kho lấy live từ lib/inventory + localStorage trong ProductsAdmin (đồng bộ trang Tồn kho).
  return <ProductsAdmin boxes={boxes} flavors={flavors} combos={combos} />;
}
