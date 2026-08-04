"use client";

import { useState } from "react";
import type { OrderRow, OrderSource, Carrier, Status } from "@/lib/ordersMock";
import { PIPELINE } from "@/lib/ordersMock";
import { SETS, BANH, nameOf } from "@/lib/inventory";
import { setConsume, cakeConsume } from "@/lib/stockStore";
import { IconXCircle, IconPlus } from "@/components/icons";

const CARRIERS: Carrier[] = ["", "Viettel", "GHN", "GHTK", "CJ", "Vinaphone", "Vietnamobile"];
const STATUSES: Status[] = [...PIPELINE];

export default function CreateOrderModal({
  onCreate,
  onClose,
}: {
  onCreate: (o: Omit<OrderRow, "id">) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<OrderSource>("web");
  const [region, setRegion] = useState<"vn" | "kr">("kr");
  const [status, setStatus] = useState<Status>("Mới");
  const [prodType, setProdType] = useState<"set" | "cake">("set");
  const [prodKey, setProdKey] = useState<string>(SETS[0]?.key ?? "");
  const [prodQty, setProdQty] = useState(1);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [carrier, setCarrier] = useState<Carrier>("");
  const [recipient, setRecipient] = useState("");
  const [address, setAddress] = useState("");
  const [prepaid, setPrepaid] = useState(0);
  const [cod, setCod] = useState(0);
  const [cuoc, setCuoc] = useState(0);
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const cur = region === "kr" ? "₩" : "đ";

  // tên sản phẩm + tiêu hao kho (BOM)
  const set = SETS.find((s) => s.key === prodKey);
  const cake = BANH.find((c) => c.key === prodKey);
  const productName =
    prodType === "set"
      ? `${set?.name ?? "Set"} ×${prodQty}`
      : `${(cake?.name ?? "Bánh").replace(" 150g", "")} (lẻ) ×${prodQty}`;
  const consume =
    prodType === "set" ? setConsume(prodKey, prodQty) : cakeConsume(prodKey, prodQty);

  function submit() {
    if (!customer.trim()) return setErr("Nhập tên khách hàng.");
    if (!phone.trim()) return setErr("Nhập số điện thoại.");
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
      prepaid,
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
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[12px] font-medium text-slate-500">Sản phẩm (trừ kho)</span>
              <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-slate-200 text-[12px]">
                {(["set", "cake"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setProdType(t); setProdKey(t === "set" ? SETS[0].key : BANH[0].key); }}
                    className={`px-3 py-1 ${prodType === t ? "bg-blue-600 text-white" : "text-slate-500"}`}
                  >
                    {t === "set" ? "Set / Hộp" : "Bánh lẻ"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <select value={prodKey} onChange={(e) => setProdKey(e.target.value)} className={inp}>
                {(prodType === "set" ? SETS : BANH).map((o) => (
                  <option key={o.key} value={o.key}>{o.name}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={prodQty}
                onChange={(e) => setProdQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 flex-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center text-[13px]"
              />
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Sẽ trừ kho: {Object.entries(consume).length
                ? Object.entries(consume).map(([k, v]) => `${v} ${nameOf(k)}`).join(" · ")
                : "—"}
            </div>
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

          <div className="grid grid-cols-3 gap-3">
            <F label={`Trả trước (${cur})`}>
              <input type="number" value={prepaid} onChange={(e) => setPrepaid(Number(e.target.value) || 0)} className={inp} />
            </F>
            <F label={`COD (${cur})`}>
              <input type="number" value={cod} onChange={(e) => setCod(Number(e.target.value) || 0)} className={inp} />
            </F>
            <F label={`Cước VC (${cur})`}>
              <input type="number" value={cuoc} onChange={(e) => setCuoc(Number(e.target.value) || 0)} className={inp} />
            </F>
          </div>

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
