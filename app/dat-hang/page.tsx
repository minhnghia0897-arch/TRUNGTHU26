import { getBoxes, getFlavors, getCombos, getWarehouses, getFxRate } from "@/lib/catalog";
import { getBankQrVn } from "@/lib/products/bankQr";
import OrderFlow, { type InitialSelection } from "@/components/OrderFlow";

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string; combo?: string; la?: string; region?: string; ref?: string; express?: string }>;
}) {
  const sp = await searchParams;
  const [boxes, flavors, combos, warehouses, fx, bankQrVn] = await Promise.all([
    getBoxes(),
    getFlavors(),
    getCombos(),
    getWarehouses(),
    getFxRate(),
    getBankQrVn(),
  ]);
  const initial: InitialSelection = { box: sp.box, combo: sp.combo, la: sp.la, region: sp.region, ref: sp.ref, express: sp.express === "1" };
  return (
    <OrderFlow
      boxes={boxes}
      flavors={flavors}
      combos={combos}
      warehouses={warehouses}
      fx={fx}
      bankQrVn={bankQrVn}
      initial={initial}
    />
  );
}
