import { getBoxes, getFlavors, getCombos } from "@/lib/catalog";

export const metadata = { title: "Trăng Rằm — Sản phẩm" };

const vnd = (v: number) => v.toLocaleString("vi-VN") + "đ";
const krw = (v: number) => "₩" + v.toLocaleString("en-US");

export default async function SanPhamAdmin() {
  const [boxes, flavors, combos] = await Promise.all([getBoxes(), getFlavors(), getCombos()]);

  const rows = [
    ...boxes.map((b) => ({ name: b.name, type: "Hộp", vn: b.price_vn, kr: b.price_kr, meta: `${b.slots} ô`, active: b.active })),
    ...combos.map((c) => ({ name: c.name, type: "Combo", vn: 0, kr: 0, meta: `${c.flavor_ids.length} vị`, active: c.active })),
    ...flavors.map((f) => ({ name: f.name, type: f.premium ? "Vị · Premium" : "Vị", vn: f.price_vn, kr: f.price_kr, meta: `${f.weight}g`, active: f.active })),
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <h1 className="text-[15px] font-semibold text-slate-800">Sản phẩm</h1>
        <span className="text-[13px] text-slate-400">{rows.length} mục</span>
        <a href="/san-pham" className="ml-auto text-[13px] font-medium text-blue-600 hover:underline">Xem trang bán →</a>
      </header>

      <div className="p-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Tên</th>
                <th className="px-4 py-2.5">Loại</th>
                <th className="px-4 py-2.5">Quy cách</th>
                <th className="px-4 py-2.5 text-right">Giá VN</th>
                <th className="px-4 py-2.5 text-right">Giá Hàn</th>
                <th className="px-4 py-2.5 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.type}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.meta}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{r.vn ? vnd(r.vn) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{r.kr ? krw(r.kr) : "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {r.active ? "Đang bán" : "Ẩn"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
