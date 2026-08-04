import { getDashboard } from "@/lib/dashboard";

export const metadata = { title: "Trăng Rằm — Khách hàng" };

const krw = (v: number) => "₩" + v.toLocaleString("en-US");

export default async function KhachHangPage() {
  const data = await getDashboard();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <h1 className="text-[15px] font-semibold text-slate-800">Khách hàng</h1>
        <span className="text-[13px] text-slate-400">{data.customers.length} khách</span>
      </header>

      <div className="p-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Khách hàng</th>
                <th className="px-4 py-2.5">SĐT</th>
                <th className="px-4 py-2.5">Vùng đặt</th>
                <th className="px-4 py-2.5 text-right">Số kiện</th>
                <th className="px-4 py-2.5 text-right">Tổng chi tiêu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.customers.map((c, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-3 font-medium text-blue-600">{c.phone}</td>
                  <td className="px-4 py-3 text-slate-500">{c.region === "kr" ? "🇰🇷 Hàn" : "🇻🇳 VN"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.shipments.length}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{krw(c.totalKrw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-slate-400">
          Khách gom theo SĐT (Pancake dedupe theo SĐT). Bấm SĐT ở trang đơn để xem chi tiết từng kiện.
        </p>
      </div>
    </main>
  );
}
