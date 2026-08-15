import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import ProductCatalog from "@/components/ProductCatalog";

export const metadata = { title: "Doran King — Sản phẩm" };

// Dựng trang lúc khách mở, KHÔNG dựng sẵn lúc build.
// Hai lý do: (1) anh sửa giá hay thêm ảnh ở trang quản trị thì khách thấy ngay,
// không phải đợi lần deploy sau; (2) build không phụ thuộc vào database — trước
// đây database trục trặc lúc build là hỏng cả bản deploy.
export const dynamic = "force-dynamic";

export default async function SanPhamPage() {
  const [boxes, flavors, combos] = await Promise.all([
    getBoxes(),
    getFlavors(),
    getCombos(),
  ]);
  return <ProductCatalog boxes={boxes} flavors={flavors} combos={combos} />;
}
