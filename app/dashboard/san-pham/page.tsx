import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import { getDashboard } from "@/lib/dashboard";
import ProductsAdmin from "@/components/ProductsAdmin";

export const metadata = { title: "Trăng Rằm — Sản phẩm" };

export default async function SanPhamAdmin() {
  const [boxes, flavors, combos, dash] = await Promise.all([
    getBoxes(),
    getFlavors(),
    getCombos(),
    getDashboard(),
  ]);
  return (
    <ProductsAdmin boxes={boxes} flavors={flavors} combos={combos} inventory={dash.inventory} />
  );
}
