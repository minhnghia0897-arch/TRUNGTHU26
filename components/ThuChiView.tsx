"use client";

import { RELEASED_STATUS } from "@/lib/ordersMock";
import { rowKrw } from "@/lib/orders/orderSchema";
import { useOrders } from "@/components/useOrders";
import OrdersStateBanner from "@/components/OrdersStateBanner";

const krw = (v: number) => "₩" + Math.round(v).toLocaleString("en-US");

export default function ThuChiView() {
  // Cùng một nguồn với trang Đơn hàng — trước đây trang này bỏ qua phần đã sửa
  // nên đổi trạng thái đơn xong doanh thu ở đây vẫn đứng yên.
  const store = useOrders();

  const all = store.rows.filter((r) => !RELEASED_STATUS.has(r.status));
  const webCount = all.filter((r) => r.source !== "facebook").length;

  // COD chỉ tính là tiền ĐÃ VỀ khi đơn được đánh dấu "Đã thu tiền".
  //
  // Bản cũ cộng thẳng toàn bộ COD vào doanh thu ngay lúc tạo đơn: đơn vừa lên
  // shipper chưa thu đồng nào cũng đã nằm trong con số doanh thu, và nút "Đã
  // thu tiền" không đổi được gì. Nay tách hẳn tiền đã về khỏi tiền còn ở ngoài.
  const t = all.reduce(
    (a, r) => {
      const cod = rowKrw(r.cod, r);
      const collected = r.status === "Đã thu tiền";
      return {
        prepaid: a.prepaid + rowKrw(r.prepaid, r),
        codIn: a.codIn + (collected ? cod : 0),
        codOut: a.codOut + (collected ? 0 : cod),
        cuoc: a.cuoc + rowKrw(r.cuoc_vc, r),
        phi: a.phi + rowKrw(r.phi_vc_thu_khach, r),
      };
    },
    { prepaid: 0, codIn: 0, codOut: 0, cuoc: 0, phi: 0 },
  );
  const received = t.prepaid + t.codIn; // tiền thật đã nằm trong tay
  const pending = t.codOut; // COD còn ở shipper, chưa thu
  const shipCost = t.cuoc - t.phi;
  const waitingCount = all.filter((r) => rowKrw(r.cod, r) > 0 && r.status !== "Đã thu tiền").length;

  // Cùng cách tính với thẻ "Đã về" ở trên — không thì hai chỗ nói hai số khác nhau.
  const byRegion = (["kr", "vn"] as const).map((rg) => {
    const rows = all.filter((r) => r.region === rg);
    const rev = rows.reduce(
      (s, r) => s + rowKrw(r.prepaid, r) + (r.status === "Đã thu tiền" ? rowKrw(r.cod, r) : 0),
      0,
    );
    return { rg, count: rows.length, rev };
  });

  const cards = [
    { lab: "Đã về (CK + COD đã thu)", val: krw(received), tone: "text-emerald-600" },
    { lab: "Trả trước (đã CK)", val: krw(t.prepaid) },
    {
      lab: "COD chờ thu",
      val: krw(pending),
      tone: pending > 0 ? "text-amber-600" : undefined,
      hint: waitingCount > 0 ? `${waitingCount} đơn chưa đánh dấu "Đã thu tiền"` : undefined,
    },
    { lab: "Chi phí ship thực", val: krw(shipCost), tone: "text-rose-600" },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <h1 className="text-[15px] font-semibold text-slate-800">Thu chi</h1>
        <span className="text-[13px] text-slate-400">Hợp nhất theo ₩</span>
        {webCount > 0 && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
            gồm {webCount} đơn web/tạo tay
          </span>
        )}
      </header>

      <OrdersStateBanner store={store} />

      <div className="p-5">
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{c.lab}</div>
              <div className={`mt-1.5 text-xl font-bold ${c.tone ?? "text-slate-800"}`}>{c.val}</div>
              {c.hint && <div className="mt-1 text-[11px] text-slate-400">{c.hint}</div>}
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-[14px] font-semibold text-slate-800">
            Tiền đã về theo vùng
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Vùng</th>
                <th className="px-4 py-2.5 text-right">Số đơn</th>
                <th className="px-4 py-2.5 text-right">Đã về</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byRegion.map((r) => (
                <tr key={r.rg} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.rg === "kr" ? "🇰🇷 Kho Hàn" : "🇻🇳 Kho VN"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.count}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{krw(r.rev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-slate-400">
          Đơn huỷ / khách trả lại / đã hoàn tiền không tính vào doanh thu. Số tiền quy về ₩
          theo tỉ giá đã chốt lúc tạo từng đơn.
        </p>
      </div>
    </main>
  );
}
