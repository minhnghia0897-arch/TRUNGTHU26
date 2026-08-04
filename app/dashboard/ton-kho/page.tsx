import { getDashboard } from "@/lib/dashboard";

export const metadata = { title: "Trăng Rằm — Tồn kho" };

export default async function TonKhoPage() {
  const data = await getDashboard();
  const low = data.inventory.filter((i) => i.status !== "ok").length;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <h1 className="text-[15px] font-semibold text-slate-800">Tồn kho</h1>
        <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-500">
          Pancake · mirror
        </span>
        {low > 0 && <span className="text-[13px] text-amber-600">{low} mặt hàng dưới ngưỡng</span>}
      </header>

      <div className="p-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Mặt hàng</th>
                <th className="px-4 py-2.5 text-right">Tồn</th>
                <th className="px-4 py-2.5 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.inventory.map((i, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{i.name}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{i.qty}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        i.status === "ok"
                          ? "bg-emerald-100 text-emerald-700"
                          : i.status === "low"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {i.status === "ok" ? "Đủ" : i.status === "low" ? "Sắp hết" : "Hết"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-slate-400">
          Nguồn chân lý = Pancake. Web chỉ hiển thị + cảnh báo dưới ngưỡng, không sửa tồn kho (§15).
        </p>
      </div>
    </main>
  );
}
