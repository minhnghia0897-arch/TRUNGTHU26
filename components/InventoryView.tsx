"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Box, Combo, Flavor } from "@/lib/types";

// ============================================================================
// Tồn kho — đọc thẳng từ danh mục sản phẩm trong database.
//
// Bản cũ dựng trên lib/inventory.ts (số mẫu hardcode) + localStorage, nên mỗi
// máy một con số và đơn của khách trừ vào bản sao trong trình duyệt của khách.
// Nay tồn nằm cùng bản ghi sản phẩm (§0012), máy chủ trừ lúc tạo đơn.
// ============================================================================

interface Row {
  key: string;
  name: string;
  type: "Bộ quà tặng" | "Vị bánh" | "Hộp";
  stock: number;
  allowNegative: boolean;
  active: boolean;
  sellable: boolean;
}

const API = "/api/dashboard/products";

export default function InventoryView({
  boxes,
  flavors,
  combos,
  connected,
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  connected: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const rows: Row[] = [
    ...combos.map((c) => ({
      key: `combo:${c.id}`, name: c.name, type: "Bộ quà tặng" as const,
      stock: c.stock ?? 0, allowNegative: c.allow_negative ?? false,
      active: c.active, sellable: true,
    })),
    ...boxes.map((b) => ({
      key: `box:${b.id}`, name: b.name, type: "Hộp" as const,
      stock: b.stock ?? 0, allowNegative: b.allow_negative ?? false,
      active: b.active, sellable: true,
    })),
    // Vị chỉ là thành phần của set, không bán lẻ (giá lẻ = 0) → đếm tồn không có
    // ý nghĩa, nhưng vẫn liệt kê để ai muốn ghi số nội bộ thì ghi.
    ...flavors.map((f) => ({
      key: `flavor:${f.id}`, name: f.name, type: "Vị bánh" as const,
      stock: f.stock ?? 0, allowNegative: f.allow_negative ?? false,
      active: f.active, sellable: f.price_kr > 0 || f.price_vn > 0,
    })),
  ].filter((r) => !r.key.startsWith("removed"));

  const valueOf = (r: Row) => draft[r.key] ?? r.stock;
  const dirty = (r: Row) => draft[r.key] !== undefined && draft[r.key] !== r.stock;

  const save = async (r: Row) => {
    const stock = valueOf(r);
    setSaving(r.key);
    setError("");
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: r.key, patch: { stock } }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Không lưu được tồn kho.");
      setDraft((d) => {
        const n = { ...d };
        delete n[r.key];
        return n;
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được tồn kho.");
    } finally {
      setSaving(null);
    }
  };

  // Hàng cần chú ý nổi lên trước: âm trước, rồi sắp hết, rồi còn nhiều.
  const sorted = [...rows].sort((a, b) => {
    const rank = (r: Row) => (r.stock < 0 ? 0 : r.stock === 0 ? 1 : r.stock <= 10 ? 2 : 3);
    return rank(a) - rank(b) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
  });

  const canhBao = rows.filter((r) => r.sellable && r.stock <= 0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-700">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-[15px] font-semibold text-slate-800">Tồn kho</h1>
        <span className="text-[12px] text-slate-400">{rows.length} mặt hàng</span>
        <a href="/dashboard/san-pham" className="ml-auto text-[13px] font-medium text-blue-600 hover:underline">
          Sang Sản phẩm →
        </a>
      </div>

      {!connected && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-[12.5px] text-amber-800">
          Chưa nối cơ sở dữ liệu — số hiển thị chỉ là hàng mẫu và sửa sẽ không lưu được.
        </div>
      )}
      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-[12.5px] text-rose-700">{error}</div>
      )}
      {canhBao.length > 0 && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-[12.5px] text-rose-700">
          Hết hàng: <b>{canhBao.map((r) => r.name).join(", ")}</b>. Khách vẫn đặt được và tồn sẽ xuống âm.
        </div>
      )}

      <div className="px-5 py-4">
        <p className="mb-3 text-[12.5px] text-slate-500">
          Tồn kho nằm ngay trên sản phẩm. Khách đặt là máy chủ tự trừ, mở máy nào cũng thấy cùng một con số.
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Sản phẩm</th>
                <th className="px-4 py-2.5">Loại</th>
                <th className="px-4 py-2.5 w-52">Còn bán được</th>
                <th className="px-4 py-2.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((r) => {
                const v = valueOf(r);
                return (
                  <tr key={r.key} className={r.active ? "" : "opacity-55"}>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {r.name}
                      {!r.active && <span className="ml-1.5 text-[11px] text-slate-400">(ẩn)</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{r.type}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setDraft((d) => ({ ...d, [r.key]: v - 1 }))}
                          className="h-7 w-7 flex-none rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={v}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.key]: Number(e.target.value) || 0 }))}
                          className={`w-20 rounded-lg border px-2 py-1 text-center outline-none focus:border-blue-400 ${v < 0 ? "border-rose-300 text-rose-600" : "border-slate-200"}`}
                        />
                        <button
                          onClick={() => setDraft((d) => ({ ...d, [r.key]: v + 1 }))}
                          className="h-7 w-7 flex-none rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          +
                        </button>
                        {dirty(r) && (
                          <button
                            onClick={() => void save(r)}
                            disabled={saving === r.key}
                            className="rounded-lg bg-blue-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving === r.key ? "Đang lưu…" : "Lưu"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          r.stock < 0
                            ? "bg-rose-100 text-rose-700"
                            : r.stock === 0
                              ? "bg-slate-100 text-slate-500"
                              : r.stock <= 10
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {r.stock < 0 ? `Âm ${Math.abs(r.stock)}` : r.stock === 0 ? "Hết" : r.stock <= 10 ? "Sắp hết" : "Đủ"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
