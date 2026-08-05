import { getBoxes, getFlavors, getCombos, getWarehouses, getFxRate } from "@/lib/catalog";
import OrderFlow, { type InitialSelection } from "@/components/OrderFlow";

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string; combo?: string; la?: string; region?: string; ref?: string }>;
}) {
  const sp = await searchParams;
  const [boxes, flavors, combos, warehouses, fx] = await Promise.all([
    getBoxes(),
    getFlavors(),
    getCombos(),
    getWarehouses(),
    getFxRate(),
  ]);
  const initial: InitialSelection = { box: sp.box, combo: sp.combo, la: sp.la, region: sp.region, ref: sp.ref };
  return (
    <OrderFlow
      boxes={boxes}
      flavors={flavors}
      combos={combos}
      warehouses={warehouses}
      fx={fx}
      initial={initial}
    />
  );
}
