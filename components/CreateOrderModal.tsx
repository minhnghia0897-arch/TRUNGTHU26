"use client";

import { useState } from "react";
import type { OrderRow, OrderSource, Carrier, Status } from "@/lib/ordersMock";
import { PIPELINE } from "@/lib/ordersMock";
import { sellableItems, type SellItem } from "@/lib/pricing";
import type { Box, Combo, Flavor } from "@/lib/types";
import { IconXCircle, IconPlus } from "@/components/icons";

const CARRIERS: Carrier[] = ["", "Viettel", "GHN", "GHTK", "CJ", "Vinaphone", "Vietnamobile"];
const STATUSES: Status[] = [...PIPELINE];

/** Giá trị điền sẵn — ô AI đọc ghi chú đổ vào đây, người duyệt sửa nốt. */
export interface CreateOrderPrefill {
  source?: OrderSource;
  region?: "vn" | "kr";
  itemKey?: string;
  qty?: number;
  customer?: string;
  phone?: string;
  address?: string;
  paid?: number;
  expected?: string;
  note?: string;
}

export default function CreateOrderModal({
  boxes,
  flavors,
  combos,
  initial,
  onCreate,
  onClose,
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  /** Điền sẵn form (từ ô đọc ghi chú). Không có thì form trống như cũ. */
  initial?: CreateOrderPrefill;
  onCreate: (o: Omit<OrderRow, "id">) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<OrderSource>(initial?.source ?? "web");
  const [region, setRegion] = useState<"vn" | "kr">(initial?.region ?? "kr");
  const [status, setStatus] = useState<Status>("Mới");
  const [itemKey, setItemKey] = useState(initial?.itemKey ?? "");
  const [prodQty, setProdQty] = useState(initial?.qty ?? 1);
  const [customer, setCustomer] = useState(initial?.customer ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [carrier, setCarrier] = useState<Carrier>("");
  const [recipient, setRecipient] = useState("");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [paid, setPaid] = useState(initial?.paid ?? 0); // đã cọc; COD suy ra
  const [shipFee, setShipFee] = useState(0); // phí ship THU CỦA KHÁCH
  const [cuoc, setCuoc] = useState(0); // cước trả hãng vận chuyển
  const [expected, setExpected] = useState(initial?.expected ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [err, setErr] = useState("");

  const cur = region === "kr" ? "₩" : "đ";
  const money = (v: number) =>
    region === "kr" ? "₩" + Math.round(v).toLocaleString("en-US") : Math.round(v).toLocaleString("vi-VN") + "đ";

  // Danh mục THẬT, giá theo vùng kho. Bản cũ dựng trên bảng hardcode của menu
  // cũ nên đơn tạo tay ghi tên hàng không tồn tại và khoá tiêu hao không khớp
  // với sản phẩm — kho không hề nhúc nhích.
  const items = sellableItems(combos, boxes, flavors, region);
  const item: SellItem | undefined = items.find((i) => i.key === itemKey) ?? items[0];

  const goods = (item?.price ?? 0) * prodQty;
  const total = goods + shipFee; // tổng phải thu
  const daCoc = Math.min(Math.max(0, paid), total);
  const cod = total - daCoc; // COD = tổng (gồm ship) − đã cọc

  const productName = item ? `${item.label} ×${prodQty}` : "";
  const consume: Record<string, number> = item ? { [item.consumeKey]: prodQty } : {};

  function submit() {
    if (!customer.trim()) return setErr("Nhập tên khách hàng.");
    if (!phone.trim()) return setErr("Nhập số điện thoại.");
    if (!item) return setErr("Danh mục chưa có sản phẩm nào bán được.");
    onCreate({
      source,
      region,
      status,
      vc: "",
      tags: [],
      note,
      customer: customer.trim(),
      recipient: recipient.trim() || customer.trim(),
      phone: phone.trim(),
      carrier,
      address: address.trim(),
      cod,
      prepaid: daCoc,
      shipFee,
      goodsAmount: goods,
      cuoc_vc: cuoc,
      phi_vc_thu_khach: 0,
      product: productName,
      consume,
      expected: expected || undefined,
      assignee: "Do",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <IconPlus width={18} height={18} className="text-blue-600" />
          <h3 className="text-[15px] font-semibold text-slate-800">Tạo đơn mới</h3>
          <button onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
            <IconXCircle width={20} height={20} />
          </button>
        </div>

        {/* body */}
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-3">
            <F label="Nguồn">
              <Sel value={source} onChange={(v) => setSource(v as OrderSource)} opts={[["web", "Online"], ["facebook", "Facebook"], ["pos", "Tại quầy"]]} />
            </F>
            <F label="Kho / Vùng">
              <Sel value={region} onChange={(v) => setRegion(v as "vn" | "kr")} opts={[["kr", "🇰🇷 Kho Hàn"], ["vn", "🇻🇳 Kho VN"]]} />
            </F>
            <F label="Trạng thái">
              <Sel value={status} onChange={(v) => setStatus(v as Status)} opts={STATUSES.map((s) => [s, s])} />
            </F>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <span className="mb-2 block text-[12px] font-medium text-slate-500">Sản phẩm</span>

            {items.length === 0 ? (
              <p className="text-[13px] text-amber-700">
                Danh mục chưa có sản phẩm nào bán được ở vùng này — vào trang Sản phẩm đặt giá trước.
              </p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={item?.key ?? ""}
                  onChange={(e) => setItemKey(e.target.value)}
                  className={inp}
                >
                  {items.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label} — {money(o.price)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={prodQty}
                  onChange={(e) => setProdQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 flex-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center text-[13px]"
                  title="Số lượng"
                />
              </div>
            )}

            <p className="mt-2 text-[11px] text-slate-400">
              Giá lấy từ bảng giá. Tạo đơn xong máy chủ trừ kho{" "}
              {item ? <b>{prodQty} {item.label}</b> : "—"}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <F label="Khách hàng *">
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Tên khách" className={inp} />
            </F>
            <F label="Số điện thoại *">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="SĐT" className={inp} />
            </F>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <F label="Người nhận">
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="(mặc định = khách)" className={inp} />
            </F>
            <F label="ĐVVC">
              <Sel value={carrier} onChange={(v) => setCarrier(v as Carrier)} opts={CARRIERS.map((c) => [c, c || "—"])} />
            </F>
          </div>

          <F label="Địa chỉ nhận">
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Địa chỉ" className={inp} />
          </F>

          {/* Tiền: giá hàng cố định theo bảng giá, hai ô dưới chỉ chia nhau tổng */}
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
            <div className="flex justify-between text-slate-500">
              <span>Tiền hàng</span>
              <span className="font-medium text-slate-700">{money(goods)}</span>
            </div>
            <div className="mt-1 flex justify-between text-slate-500">
              <span>Phí ship khách trả</span>
              <span className="font-medium text-slate-700">{money(shipFee)}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-800">
              <span>Tổng phải thu</span>
              <span>{money(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <F label={`Phí ship khách trả (${cur})`}>
              <input type="number" value={shipFee} onChange={(e) => setShipFee(Math.max(0, Number(e.target.value) || 0))} className={inp} />
            </F>
            <F label={`Đã cọc (${cur})`}>
              <input type="number" value={daCoc} onChange={(e) => setPaid(Number(e.target.value) || 0)} className={inp} />
            </F>
            <F label={`Cước VC trả hãng (${cur})`}>
              <input type="number" value={cuoc} onChange={(e) => setCuoc(Number(e.target.value) || 0)} className={inp} />
            </F>
          </div>
          <p className="-mt-2 text-[11.5px] text-slate-400">
            COD còn phải thu = <b>{money(cod)}</b> (tổng gồm ship trừ đã cọc).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <F label="Dự kiến nhận">
              <input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className={inp} />
            </F>
          </div>

          <F label="Ghi chú">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inp} />
          </F>

          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{err}</div>}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">
            Huỷ
          </button>
          <button onClick={submit} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-blue-700">
            <IconPlus width={15} height={15} /> Tạo đơn
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inp}>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
