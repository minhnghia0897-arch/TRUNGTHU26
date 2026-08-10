"use client";

import { useEffect, useMemo, useState } from "react";
import { ORDERS, STATUS_COLOR, type OrderRow, type Status } from "@/lib/ordersMock";
import OrderDetailModal, { type HistoryEntry } from "@/components/OrderDetailModal";
import { applyStock } from "@/lib/stockStore";

// dùng chung localStorage với bảng Đơn hàng để sửa ở đâu cũng khớp
const HISTORY_KEY = "tr_order_history";
const EDITS_KEY = "tr_order_edits";

const FX = 18.5;
const toKrw = (v: number, region: "vn" | "kr") => (region === "kr" ? v : v / FX);
const krw = (v: number) => "₩" + Math.round(v).toLocaleString("en-US");
// đơn huỷ/trả/hoàn không tính vào tổng chi tiêu
const RELEASED = new Set<Status>(["Huỷ đơn", "Khách trả lại", "Đã hoàn toàn bộ"]);
const digits = (s: string) => s.replace(/\D/g, "");
/** Mã đơn gốc — nhiều kiện của cùng một đơn dùng chung mã (ghi trong note). */
const codeOf = (r: OrderRow) => r.note?.match(/TR-\d+/)?.[0] ?? `#${r.id}`;

type Group = {
  key: string;
  name: string;
  phone: string;
  rows: OrderRow[];
  orders: string[];
  spentKrw: number;
};

export default function CustomersView() {
  const [rows, setRows] = useState<OrderRow[]>(ORDERS);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [history, setHistory] = useState<Record<number, HistoryEntry[]>>({});

  // đọc cùng nguồn với bảng Đơn hàng: đơn mẫu + đơn web/tạo tay + bản đã sửa
  useEffect(() => {
    try {
      const created: OrderRow[] = JSON.parse(localStorage.getItem("tr_order_new") || "[]");
      const edits: Record<number, OrderRow> = JSON.parse(localStorage.getItem(EDITS_KEY) || "{}");
      setRows([...created, ...ORDERS].map((r) => edits[r.id] ?? r));
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}"));
    } catch {
      /* ignore */
    }
  }, []);

  // sửa đơn ngay tại đây — ghi vào cùng key với bảng Đơn hàng (kể cả trừ/hoàn kho)
  const saveOrder = (input: OrderRow, changes: string[]) => {
    let updated = input;
    if (input.consume) {
      const should = !RELEASED.has(input.status);
      if (should !== !!input.stockApplied) {
        applyStock(input.consume, should ? -1 : 1);
        updated = { ...input, stockApplied: should };
      }
    }
    setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    try {
      const edits = JSON.parse(localStorage.getItem(EDITS_KEY) || "{}");
      localStorage.setItem(EDITS_KEY, JSON.stringify({ ...edits, [updated.id]: updated }));
    } catch {
      /* ignore */
    }
    setHistory((h) => {
      const n = new Date();
      const p = (x: number) => String(x).padStart(2, "0");
      const entry: HistoryEntry = {
        at: `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`,
        by: "Bạn",
        changes,
      };
      const next = { ...h, [updated.id]: [entry, ...(h[updated.id] ?? [])] };
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const customers = useMemo(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      const key = digits(r.phone) || r.customer.trim().toLowerCase();
      if (!key) continue;
      const g =
        m.get(key) ?? { key, name: r.customer, phone: r.phone, rows: [], orders: [], spentKrw: 0 };
      g.rows.push(r);
      const code = codeOf(r);
      if (!g.orders.includes(code)) g.orders.push(code);
      if (!RELEASED.has(r.status)) g.spentKrw += toKrw(r.prepaid + r.cod, r.region);
      m.set(key, g);
    }
    const list = [...m.values()];
    const kw = q.trim().toLowerCase();
    const filtered = kw
      ? list.filter((c) => c.name.toLowerCase().includes(kw) || digits(c.phone).includes(digits(kw)))
      : list;
    return filtered.sort((a, b) => b.spentKrw - a.spentKrw);
  }, [rows, q]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <h1 className="text-[15px] font-semibold text-slate-800">Khách hàng</h1>
        <span className="text-[13px] text-slate-400">{customers.length} khách</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tên hoặc SĐT…"
          className="ml-auto w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px]"
        />
      </header>

      <div className="p-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Khách hàng</th>
                <th className="px-4 py-2.5">SĐT</th>
                <th className="px-4 py-2.5 text-right">Số đơn</th>
                <th className="px-4 py-2.5 text-right">Số kiện</th>
                <th className="px-4 py-2.5 text-right">Tổng chi tiêu</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => {
                const isOpen = open === c.key;
                return [
                  <tr
                    key={c.key}
                    onClick={() => setOpen(isOpen ? null : c.key)}
                    className={`cursor-pointer ${isOpen ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 font-medium text-blue-600">{c.phone}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{c.orders.length}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{c.rows.length}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{krw(c.spentKrw)}</td>
                    <td className="px-4 py-3 text-right text-[11px] text-slate-400">
                      {isOpen ? "Thu gọn ▲" : "Xem đơn ▼"}
                    </td>
                  </tr>,

                  isOpen && (
                    <tr key={c.key + "-detail"}>
                      <td colSpan={6} className="bg-slate-50/70 px-4 py-3">
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-[12.5px]">
                            <thead>
                              <tr className="bg-white text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
                                <th className="px-3 py-2">Mã đơn</th>
                                <th className="px-3 py-2">Ngày</th>
                                <th className="px-3 py-2">Người nhận</th>
                                <th className="px-3 py-2">Địa chỉ</th>
                                <th className="px-3 py-2">Sản phẩm</th>
                                <th className="px-3 py-2">Trạng thái</th>
                                <th className="px-3 py-2 text-right">Tiền</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {c.rows.map((r) => (
                                <tr
                                  key={r.id}
                                  onClick={() => setDetailId(r.id)}
                                  title="Bấm để xem chi tiết đơn"
                                  className={`cursor-pointer hover:bg-blue-50/60 ${RELEASED.has(r.status) ? "opacity-50" : ""}`}
                                >
                                  <td className="whitespace-nowrap px-3 py-2">
                                    <span className="font-medium text-blue-600 underline decoration-blue-200 underline-offset-2">
                                      {codeOf(r)}
                                    </span>
                                    {/* đơn web có mã TR- riêng → kèm số dòng; đơn cũ chỉ có số dòng */}
                                    {codeOf(r) !== `#${r.id}` && (
                                      <span className="ml-1.5 text-[10.5px] text-slate-400">#{r.id}</span>
                                    )}
                                    {r.note?.match(/Kiện \d+\/\d+/) && (
                                      <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                        {r.note.match(/Kiện \d+\/\d+/)![0]}
                                      </span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.created ?? "—"}</td>
                                  <td className="px-3 py-2 text-slate-700">{r.recipient || "—"}</td>
                                  <td className="max-w-[220px] truncate px-3 py-2 text-slate-500" title={r.address}>
                                    {r.region === "kr" ? "🇰🇷 " : "🇻🇳 "}
                                    {r.address || "—"}
                                  </td>
                                  <td className="max-w-[220px] truncate px-3 py-2 text-slate-500" title={r.product}>
                                    {r.product || "—"}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2">
                                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                                      {r.status}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-800">
                                    {krw(toKrw(r.prepaid + r.cod, r.region))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-[11.5px] text-slate-500">
                          <b>{c.orders.length}</b> đơn · <b>{c.rows.length}</b> kiện · tổng <b>{krw(c.spentKrw)}</b>
                          {c.rows.length > c.orders.length && " — một đơn gửi nhiều người nhận được tách thành nhiều kiện, mỗi kiện 1 dòng."}
                        </p>
                      </td>
                    </tr>
                  ),
                ];
              })}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Không tìm thấy khách nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-slate-400">
          Khách gom theo SĐT (Pancake dedupe theo SĐT). Bấm vào khách để xem toàn bộ đơn đã đặt, bấm tiếp vào một đơn
          để mở chi tiết. Đơn huỷ/trả/hoàn không tính vào tổng chi tiêu. Quy đổi ₩ theo fx {FX}.
        </p>
      </div>

      {/* chi tiết đơn — dùng chung modal với bảng Đơn hàng, sửa ở đây cũng lưu như bên đó */}
      {(() => {
        const order = rows.find((r) => r.id === detailId);
        return order ? (
          <OrderDetailModal
            order={order}
            history={history[order.id] ?? []}
            onSave={saveOrder}
            onClose={() => setDetailId(null)}
          />
        ) : null;
      })()}
    </main>
  );
}
