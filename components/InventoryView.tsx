"use client";

import { useEffect, useMemo, useState } from "react";
import { VO, BANH, ALL_STOCK, SETS, availableSet, type StockItem } from "@/lib/inventory";
import { getStock, saveStock, STOCK_KEY, getNames, saveNames, NAME_KEY } from "@/lib/stockStore";

const statusOf = (qty: number, th: number) => (qty <= 0 ? "out" : qty < th ? "low" : "ok");
const badge = (s: string) =>
  s === "ok" ? "bg-emerald-100 text-emerald-700" : s === "low" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
const label = (s: string) => (s === "ok" ? "Đủ" : s === "low" ? "Sắp hết" : "Hết");

export default function InventoryView() {
  // ---- tồn kho dùng chung (đặt đơn tự trừ ở đây) ----
  const [stock, setStock] = useState<Record<string, number>>(() =>
    Object.fromEntries(ALL_STOCK.map((s) => [s.key, s.qty])),
  );
  // ---- tên mặt hàng (đổi tên được) ----
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    setStock(getStock());
    setNames(getNames());
    const onChange = (e: StorageEvent) => {
      if (!e.key || e.key === STOCK_KEY) setStock(getStock());
      if (!e.key || e.key === NAME_KEY) setNames(getNames());
    };
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);
  const DEFAULT_NAME: Record<string, string> = Object.fromEntries(ALL_STOCK.map((s) => [s.key, s.name]));
  const nameFor = (k: string) => names[k] ?? DEFAULT_NAME[k] ?? k;
  const setName = (k: string, v: string) =>
    setNames((cur) => {
      const t = v.trim();
      const next = { ...cur };
      if (t && t !== DEFAULT_NAME[k]) next[k] = t;
      else delete next[k]; // để trống hoặc trùng mặc định → về tên gốc
      saveNames(next);
      return next;
    });
  const qtyOf = (k: string) => stock[k] ?? 0;
  const setStockQty = (k: string, v: number) =>
    setStock((cur) => {
      const next = { ...cur, [k]: Math.max(0, Math.floor(v) || 0) };
      saveStock(next);
      return next;
    });

  // ---- máy tính bán ----
  const [setQty, setSetQty] = useState<Record<string, number>>({});
  const [looseQty, setLooseQty] = useState<Record<string, number>>({});

  // trừ kho từ đơn mô phỏng
  const deduction = useMemo(() => {
    const d: Record<string, number> = {};
    for (const set of SETS) {
      const n = setQty[set.key] || 0;
      if (!n) continue;
      d[set.voKey] = (d[set.voKey] || 0) + n; // 1 vỏ / set
      for (const c of set.cakes) d[c.key] = (d[c.key] || 0) + n * c.qty;
    }
    for (const [k, v] of Object.entries(looseQty)) if (v) d[k] = (d[k] || 0) + v;
    return d;
  }, [setQty, looseQty]);

  const hasOrder = Object.values(deduction).some((v) => v > 0);
  const shortage = ALL_STOCK.filter((s) => (deduction[s.key] || 0) > qtyOf(s.key));

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <h1 className="text-[15px] font-semibold text-slate-800">Tồn kho</h1>
        <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-500">Tính theo thành phần (BOM)</span>
      </header>

      <div className="mx-auto max-w-[1080px] space-y-5 p-5">
        {/* ===== TỒN SET KHẢ DỤNG ===== */}
        <Panel title="Set bán được (tính từ tồn thành phần)" note="Tồn set = min(vỏ hộp, ⌊tồn bánh ÷ số lượng trong set⌋)">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Set</th>
                <th className="px-3 py-2">Định mức (1 set cần)</th>
                <th className="px-3 py-2 text-right">Làm được</th>
                <th className="px-3 py-2">Thành phần giới hạn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SETS.map((set) => {
                const av = availableSet(set, qtyOf);
                return (
                  <tr key={set.key}>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{set.name}</td>
                    <td className="px-3 py-2.5 text-slate-500">
                      1 {nameFor(set.voKey)} + {set.cakes.map((c) => `${c.qty} ${nameFor(c.key).replace("Bánh ", "").replace(" 150g", "")}`).join(", ")}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`rounded px-2 py-0.5 text-[12px] font-semibold ${badge(statusOf(av.count, 10))}`}>{av.count} set</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {av.count === 0 ? <span className="text-rose-600">Hết: {av.bottleneck}</span> : av.bottleneck}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        {/* ===== MÁY TÍNH BÁN ===== */}
        <Panel title="Máy tính bán hàng — mô phỏng trừ kho" note="Nhập số lượng bán → xem trừ kho từng thành phần & tồn còn lại">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-[12px] font-semibold text-slate-500">Bán Set</div>
              <div className="space-y-2">
                {SETS.map((set) => (
                  <div key={set.key} className="flex items-center gap-2">
                    <span className="flex-1 text-[13px] text-slate-700">{set.name}</span>
                    <Stepper value={setQty[set.key] || 0} onChange={(v) => setSetQty((s) => ({ ...s, [set.key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[12px] font-semibold text-slate-500">Bán bánh lẻ</div>
              <div className="space-y-2">
                {BANH.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="flex-1 text-[13px] text-slate-700">{nameFor(f.key)}</span>
                    <Stepper value={looseQty[f.key] || 0} onChange={(v) => setLooseQty((s) => ({ ...s, [f.key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {hasOrder && (
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Thành phần bị trừ</th>
                    <th className="px-3 py-2 text-right">Tồn hiện tại</th>
                    <th className="px-3 py-2 text-right">Trừ đơn này</th>
                    <th className="px-3 py-2 text-right">Còn lại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ALL_STOCK.filter((s) => (deduction[s.key] || 0) > 0).map((s) => {
                    const d = deduction[s.key] || 0;
                    const left = qtyOf(s.key) - d;
                    return (
                      <tr key={s.key} className={left < 0 ? "bg-rose-50" : ""}>
                        <td className="px-3 py-2 font-medium text-slate-800">{nameFor(s.key)}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{qtyOf(s.key)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-rose-600">−{d}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${left < 0 ? "text-rose-600" : "text-slate-800"}`}>
                          {left}{left < 0 ? " (thiếu!)" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className={`px-3 py-2 text-[13px] font-medium ${shortage.length ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {shortage.length
                  ? `⚠ Không đủ hàng: ${shortage.map((s) => nameFor(s.key)).join(", ")}`
                  : "✓ Đủ hàng cho đơn này"}
              </div>
            </div>
          )}
          {!hasOrder && <p className="mt-3 text-[13px] text-slate-400">Nhập số lượng ở trên để tính.</p>}
        </Panel>

        {/* ===== KHO VỎ + BÁNH (sửa số tồn) ===== */}
        <div className="grid gap-5 md:grid-cols-2">
          <StockTable title="Kho vỏ hộp" items={VO} qtyOf={qtyOf} onChange={setStockQty} nameFor={nameFor} onRename={setName} />
          <StockTable title="Kho bánh (mỗi vị 1 SKU)" items={BANH} qtyOf={qtyOf} onChange={setStockQty} nameFor={nameFor} onRename={setName} />
        </div>

        <p className="text-[12px] text-slate-400">
          Vỏ hộp và bánh là 2 đơn vị kho riêng. Bán set trừ 1 vỏ + các bánh theo định mức; bán lẻ trừ bánh đó — cùng vị bánh dùng chung một kho. Bản thật: tồn đọc mirror từ Pancake (§15).
        </p>
      </div>
    </main>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200">
      <button onClick={() => onChange(Math.max(0, value - 1))} className="px-2.5 py-1 text-slate-500 hover:bg-slate-50">−</button>
      <input
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-10 border-x border-slate-200 py-1 text-center text-[13px] outline-none"
      />
      <button onClick={() => onChange(value + 1)} className="px-2.5 py-1 text-slate-500 hover:bg-slate-50">+</button>
    </div>
  );
}

function StockTable({
  title,
  items,
  qtyOf,
  onChange,
  nameFor,
  onRename,
}: {
  title: string;
  items: StockItem[];
  qtyOf: (k: string) => number;
  onChange: (k: string, v: number) => void;
  nameFor: (k: string) => string;
  onRename: (k: string, v: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-[14px] font-semibold text-slate-800">
        {title}
        <span className="text-[11px] font-normal text-slate-400">· sửa tên & tồn được</span>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2">Mặt hàng (sửa tên)</th>
            <th className="px-4 py-2 text-right">Tồn (sửa)</th>
            <th className="px-4 py-2 text-right">Ngưỡng</th>
            <th className="px-4 py-2 text-center">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((s) => {
            const q = qtyOf(s.key);
            const st = statusOf(q, s.threshold);
            return (
              <tr key={s.key}>
                <td className="px-4 py-2">
                  <input
                    value={nameFor(s.key)}
                    onChange={(e) => onRename(s.key, e.target.value)}
                    className="w-full min-w-[9rem] rounded-lg border border-transparent bg-transparent px-2 py-1 font-medium text-slate-800 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    value={q}
                    onChange={(e) => onChange(s.key, Number(e.target.value))}
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-400"
                  />
                </td>
                <td className="px-4 py-2.5 text-right text-slate-400">{s.threshold}</td>
                <td className="px-4 py-2.5 text-center"><span className={`rounded px-2 py-0.5 text-[11px] font-medium ${badge(st)}`}>{label(st)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 text-[14px] font-semibold text-slate-800">{title}</div>
      {note && <div className="mb-3 text-[12px] text-slate-400">{note}</div>}
      {children}
    </section>
  );
}
