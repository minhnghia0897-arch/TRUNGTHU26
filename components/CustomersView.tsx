"use client";

import { useMemo, useState } from "react";
import { RELEASED_STATUS, STATUS_COLOR, type OrderRow } from "@/lib/ordersMock";
import OrderDetailModal from "@/components/OrderDetailModal";
import OrdersStateBanner from "@/components/OrdersStateBanner";
import { useOrders } from "@/components/useOrders";
import { displayCode, rowKrw, type StoredOrder } from "@/lib/orders/orderSchema";
import type { Box, Combo, Flavor } from "@/lib/types";

const krw = (v: number) => "₩" + Math.round(v).toLocaleString("en-US");
// đơn huỷ/trả/hoàn không tính vào tổng chi tiêu
const digits = (s: string) => s.replace(/\D/g, "");
/**
 * Mã đơn gốc — nhiều kiện của cùng một đơn dùng chung mã.
 * Trước đây phải moi bằng regex từ ghi chú; giờ mã đơn là một cột riêng trên
 * Sheet nên đọc thẳng, gom đơn theo khách mới chính xác.
 */
const codeOf = (r: OrderRow) =>
  displayCode(r as StoredOrder & { id: number });

type Group = {
  key: string;
  name: string;
  phone: string;
  /** Nick Facebook — để biết người này là ai trong hộp thư, không chỉ tên trên bưu kiện. */
  fbName?: string;
  rows: OrderRow[];
  orders: string[];
  spentKrw: number;
};

export default function CustomersView({
  boxes,
  flavors,
  combos,
  fbPageId,
}: {
  /** Danh mục cho popup chi tiết — sửa hàng trong đơn cần đúng tên và giá món. */
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  fbPageId?: string;
}) {
  // Cùng nguồn với trang Đơn hàng. Trước đây trang này chỉ ghi vào bản "đã sửa"
  // mà không ghi lại kho đơn, nên sửa ở đây xong hai trang hiển thị lệch nhau.
  const store = useOrders();
  const rows = store.rows;
  const history = store.history;

  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  // Kho do MÁY CHỦ cộng trừ theo trạng thái (lib/orders/orderStore.ts). Bản cũ
  // làm ở đây và ghi vào localStorage — chỗ không ai đọc.
  const saveOrder = (input: OrderRow, changes: string[]) => {
    void store.saveOrder(input, changes);
  };

  const customers = useMemo(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      const key = digits(r.phone) || r.customer.trim().toLowerCase();
      if (!key) continue;
      const g =
        m.get(key) ?? { key, name: r.customer, phone: r.phone, rows: [], orders: [], spentKrw: 0 };
      g.rows.push(r);
      // Đơn nào biết nick thì lấy — đơn cũ đặt trước khi có ô này không có.
      if (!g.fbName && r.messengerName) g.fbName = r.messengerName;
      const code = codeOf(r);
      if (!g.orders.includes(code)) g.orders.push(code);
      // Tiền khách đã THỰC TRẢ: COD chỉ tính khi đơn đã đánh dấu "Đã thu tiền",
      // giống cách Thu chi tính. Không thì đơn vừa gửi đi đã ghi khách trả rồi.
      if (!RELEASED_STATUS.has(r.status))
        g.spentKrw +=
          rowKrw(r.prepaid, r) + (r.status === "Đã thu tiền" ? rowKrw(r.cod, r) : 0);
      m.set(key, g);
    }
    const list = [...m.values()];
    const kw = q.trim().toLowerCase();
    const filtered = kw
      ? list.filter(
          (c) =>
            c.name.toLowerCase().includes(kw) ||
            (c.fbName ?? "").toLowerCase().includes(kw) ||
            digits(c.phone).includes(digits(kw)),
        )
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
          placeholder="Tìm tên, nick Facebook hoặc SĐT…"
          className="ml-auto w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px]"
        />
      </header>

      <OrdersStateBanner store={store} />

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
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {c.name}
                      {c.fbName && c.fbName !== c.name && (
                        <span className="ml-1.5 text-[11.5px] font-normal text-blue-600" title="Tên Facebook">
                          · {c.fbName}
                        </span>
                      )}
                    </td>
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
                                  className={`cursor-pointer hover:bg-blue-50/60 ${RELEASED_STATUS.has(r.status) ? "opacity-50" : ""}`}
                                >
                                  <td className="whitespace-nowrap px-3 py-2">
                                    <span className="font-medium text-blue-600 underline decoration-blue-200 underline-offset-2">
                                      {codeOf(r)}
                                    </span>
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
                                    {krw(rowKrw(r.prepaid + r.cod, r))}
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
          Khách gom theo SĐT. Bấm vào khách để xem toàn bộ đơn đã đặt, bấm tiếp vào một đơn để mở
          chi tiết. Đơn huỷ/trả/hoàn không tính vào tổng chi tiêu. Quy đổi ₩ theo tỉ giá đã chốt
          lúc tạo từng đơn.
        </p>
      </div>

      {/* chi tiết đơn — dùng chung modal với bảng Đơn hàng, sửa ở đây cũng lưu như bên đó */}
      {(() => {
        const order = rows.find((r) => r.id === detailId);
        return order ? (
          <OrderDetailModal
            order={order}
            history={history[order.id] ?? []}
            boxes={boxes}
            flavors={flavors}
            combos={combos}
            fbPageId={fbPageId}
            onSave={saveOrder}
            onClose={() => setDetailId(null)}
          />
        ) : null;
      })()}
    </main>
  );
}
