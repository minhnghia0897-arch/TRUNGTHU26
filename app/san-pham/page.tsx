import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import ProductCatalog from "@/components/ProductCatalog";

export const metadata = { title: "Trăng Rằm — Sản phẩm" };

export default async function SanPhamPage() {
  const [boxes, flavors, combos] = await Promise.all([
    getBoxes(),
    getFlavors(),
    getCombos(),
  ]);
  return <ProductCatalog boxes={boxes} flavors={flavors} combos={combos} />;
}
