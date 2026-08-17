import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";
import { getRecentSales } from "@/lib/orders/recentActivity";
import ProductCatalog from "@/components/ProductCatalog";
import SalesActivity from "@/components/SalesActivity";

export const metadata = { title: "Doran King — Sản phẩm" };

// Dựng trang lúc khách mở, KHÔNG dựng sẵn lúc build.
// Hai lý do: (1) anh sửa giá hay thêm ảnh ở trang quản trị thì khách thấy ngay,
// không phải đợi lần deploy sau; (2) build không phụ thuộc vào database — trước
// đây database trục trặc lúc build là hỏng cả bản deploy.
export const dynamic = "force-dynamic";

export default async function SanPhamPage() {
  // Đơn gần đây đọc ở MÁY CHỦ rồi truyền xuống đã lọc sạch: trang này ai cũng
  // xem được, nên không dựng API công khai cho đơn hàng — chỉ ba trường an toàn
  // đi ra ngoài (xem lib/orders/recentActivity.ts).
  const [boxes, flavors, combos, sales] = await Promise.all([
    getBoxes(),
    getFlavors(),
    getCombos(),
    getRecentSales(),
  ]);
  return (
    <>
      <ProductCatalog boxes={boxes} flavors={flavors} combos={combos} />
      <SalesActivity sales={sales} />
    </>
  );
}
