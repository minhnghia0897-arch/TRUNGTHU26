import { getBoxes, getFlavors, getWarehouses, getFxRate } from "@/lib/catalog";
import OrderFlow from "@/components/OrderFlow";

// Server wrapper: nạp danh mục rồi truyền xuống client flow.
export default async function OrderPage() {
  const [boxes, flavors, warehouses, fx] = await Promise.all([
    getBoxes(),
    getFlavors(),
    getWarehouses(),
    getFxRate(),
  ]);
  return <OrderFlow boxes={boxes} flavors={flavors} warehouses={warehouses} fx={fx} />;
}
