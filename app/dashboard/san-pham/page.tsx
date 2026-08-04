import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import { ALL_STOCK } from "@/lib/inventory";
import ProductsAdmin from "@/components/ProductsAdmin";

export const metadata = { title: "Trăng Rằm — Sản phẩm" };

export default async function SanPhamAdmin() {
  const [boxes, flavors, combos] = await Promise.all([getBoxes(), getFlavors(), getCombos()]);
  // Nguồn kho DUY NHẤT (lib/inventory) — sản phẩm liên kết đúng SKU với trang Tồn kho.
  const inventory = ALL_STOCK.map((s) => ({
    name: s.name,
    qty: s.qty,
    status: (s.qty <= 0 ? "out" : s.qty < s.threshold ? "low" : "ok") as "ok" | "low" | "out",
  }));
  return <ProductsAdmin boxes={boxes} flavors={flavors} combos={combos} inventory={inventory} />;
}
