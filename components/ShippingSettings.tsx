"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Warehouse } from "@/lib/types";

// ============================================================================
// Phí vận chuyển — sửa ngay ở bảng điều hành.
//
// Trước đây phí ship chỉ nằm trong database, muốn đổi phải vào Supabase gõ SQL.
// ============================================================================

const money = (v: number, cur: string) =>
  cur === "krw" ? "₩" + v.toLocaleString("en-US") : v.toLocaleString("vi-VN") + "đ";

const inp =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400";

export default function ShippingSettings({
  warehouses,
  connected,
}: {
  warehouses: Warehouse[];
  connected: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, { ship: number; handling: number; freeFromQty: number }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const valueOf = (w: Warehouse) =>
    draft[w.region] ?? {
      ship: w.fee_table.ship ?? 0,
      handling: w.fee_table.handling ?? 0,
      freeFromQty: w.fee_table.free_from_qty ?? 0,
    };

  const dirty = (w: Warehouse) => {
    const v = valueOf(w);
    return (
      v.ship !== (w.fee_table.ship ?? 0) ||
      v.handling !== (w.fee_table.handling ?? 0) ||
      v.freeFromQty !== (w.fee_table.free_from_qty ?? 0)
    );
  };

  const set = (region: string, k: "ship" | "handling" | "freeFromQty", n: number, w: Warehouse) =>
    setDraft((d) => ({ ...d, [region]: { ...valueOf(w), [k]: Math.max(0, n || 0) } }));

  const save = async (w: Warehouse) => {
    setSaving(w.region);
    setError("");
    setSaved(null);
    try {
      const res = await fetch("/api/dashboard/shipping", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ region: w.region, patch: valueOf(w) }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Không lưu được phí ship.");
      setDraft((d) => {
        const n = { ...d };
        delete n[w.region];
        return n;
      });
      setSaved(w.region);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được phí ship.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="px-5 pb-2 pt-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-[14px] font-semibold text-slate-800">Phí vận chuyển</h2>
          <span className="text-[12px] text-slate-400">
            Tính theo từng kiện — gửi 3 người là 3 kiện, mỗi kiện một lần phí.
          </span>
        </div>

        {error && (
          <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[12.5px] text-rose-700">{error}</div>
        )}

        <div className="divide-y divide-slate-100">
          {warehouses.map((w) => {
            const v = valueOf(w);
            const cur = w.local_currency;
            const included = w.shipping_mode === "included";
            return (
              <div key={w.region} className="px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-slate-800">{w.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium uppercase text-slate-500">
                    {cur === "krw" ? "Won" : "Đồng"}
                  </span>
                  {included && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700">
                      Kho này đang tính giá đã gồm ship — phí dưới đây không áp dụng
                    </span>
                  )}
                  {saved === w.region && !dirty(w) && (
                    <span className="text-[11.5px] font-medium text-emerald-600">Đã lưu</span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-medium text-slate-500">Phí ship / kiện</span>
                    <input
                      type="number"
                      value={v.ship}
                      onChange={(e) => set(w.region, "ship", Number(e.target.value), w)}
                      className={inp}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-medium text-slate-500">Phí xử lý / kiện</span>
                    <input
                      type="number"
                      value={v.handling}
                      onChange={(e) => set(w.region, "handling", Number(e.target.value), w)}
                      className={inp}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-medium text-slate-500">
                      Miễn ship từ … phần
                    </span>
                    <input
                      type="number"
                      value={v.freeFromQty}
                      onChange={(e) => set(w.region, "freeFromQty", Number(e.target.value), w)}
                      className={inp}
                      placeholder="0 = không miễn"
                    />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="text-[12px] text-slate-500">
                    {v.freeFromQty > 0 ? (
                      <>
                        Kiện có <b>từ {v.freeFromQty} phần</b> trở lên: miễn phí ship
                        {v.handling > 0 && <> (vẫn thu phí xử lý {money(v.handling, cur)})</>}. Dưới đó thu{" "}
                        {money(v.ship + v.handling, cur)}.
                      </>
                    ) : (
                      <>
                        Mọi kiện đều thu {money(v.ship + v.handling, cur)}. Điền số vào ô miễn ship để mở
                        khuyến mãi.
                      </>
                    )}
                  </p>
                  {dirty(w) && (
                    <button
                      onClick={() => void save(w)}
                      disabled={saving === w.region || !connected}
                      className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving === w.region ? "Đang lưu…" : "Lưu"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
