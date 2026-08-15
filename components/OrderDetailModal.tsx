"use client";

import { useState } from "react";
import type { OrderRow, Status } from "@/lib/ordersMock";
import { STATUS_COLOR, PIPELINE } from "@/lib/ordersMock";
import {
  IconFacebook,
  IconGlobe,
  IconStore,
  IconXCircle,
} from "@/components/icons";

export interface HistoryEntry {
  at: string;
  by: string;
  changes: string[];
}

const ALL_STATUS: Status[] = [...PIPELINE, "Khách trả lại", "Đã hoàn toàn bộ", "Huỷ đơn"];
const CARRIERS = ["", "Viettel", "GHN", "GHTK", "CJ", "Vinaphone", "Vietnamobile"];

const nat = (v: number, region: "vn" | "kr") =>
  region === "kr" ? "₩" + v.toLocaleString("en-US") : v.toLocaleString("vi-VN") + "đ";

function SrcBadge({ s }: { s: OrderRow["source"] }) {
  const map = {
    facebook: { Icon: IconFacebook, label: "Facebook", cls: "text-[#1877F2]" },
    web: { Icon: IconGlobe, label: "Online", cls: "text-emerald-500" },
    pos: { Icon: IconStore, label: "Tại quầy", cls: "text-slate-400" },
  } as const;
  const { Icon, label, cls } = map[s];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600">
      <Icon width={14} height={14} className={cls} /> {label}
    </span>
  );
}

export default function OrderDetailModal({
  order,
  history,
  onSave,
  onClose,
}: {
  order: OrderRow;
  history: HistoryEntry[];
  onSave: (updated: OrderRow, changes: string[]) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<OrderRow>(order);
  const [saved, setSaved] = useState(false);
  const money = (v: number) => nat(v, d.region);
  const set = <K extends keyof OrderRow>(k: K, v: OrderRow[K]) => {
    setD((o) => ({ ...o, [k]: v }));
    setSaved(false);
  };

  // TỔNG PHẢI THU LÀ CỐ ĐỊNH — chốt lúc mở popup, không đổi khi sửa ô nào.
  //
  // Trước đây `total` = prepaid + cod, tức là gõ vào ô nào thì giá đơn cũng
  // nhảy theo: sửa COD lên là tự nhiên đơn đắt thêm. Nay hai ô chỉ CHIA nhau
  // một tổng cố định — gõ ô này thì ô kia tự bù.
  const [total] = useState(order.prepaid + order.cod);

  // Tiền ship khách trả nằm TRONG tổng, không cộng thêm. Tách ra để dòng
  // "Sản phẩm" hiện đúng tiền hàng thuần.
  const shipFee = Math.min(d.shipFee ?? 0, total);
  const goods = total - shipFee;

  /** Sửa một ô thì ô kia bù lại, giữ nguyên tổng và không đụng tới cước ship. */
  const setSplit = (which: "prepaid" | "cod", raw: number) => {
    const v = Math.min(Math.max(0, Math.round(raw) || 0), total);
    setD((o) => ({ ...o, prepaid: which === "prepaid" ? v : total - v, cod: which === "cod" ? v : total - v }));
    setSaved(false);
  };

  const paidFull = d.cod === 0 && d.prepaid > 0;

  function diff(): string[] {
    const out: string[] = [];
    const cmp = (label: string, a: unknown, b: unknown, fmt?: (x: never) => string) => {
      if (String(a ?? "") !== String(b ?? "")) {
        const f = (x: unknown) => (fmt ? fmt(x as never) : String(x ?? "—")) || "—";
        out.push(`${label}: ${f(a)} → ${f(b)}`);
      }
    };
    cmp("Trạng thái", order.status, d.status);
    cmp("Ghi chú", order.note, d.note);
    cmp("Người nhận", order.recipient, d.recipient);
    cmp("SĐT", order.phone, d.phone);
    cmp("Địa chỉ", order.address, d.address);
    cmp("ĐVVC", order.carrier, d.carrier);
    cmp("Dự kiến nhận", order.expected, d.expected);
    cmp("NV chăm sóc", order.assignee, d.assignee);
    cmp("Trả trước", order.prepaid, d.prepaid, (x: number) => money(x));
    cmp("COD", order.cod, d.cod, (x: number) => money(x));
    return out;
  }

  function handleSave() {
    const changes = diff();
    if (changes.length === 0) {
      setSaved(true);
      return;
    }
    onSave(d, changes);
    setSaved(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-5xl rounded-2xl bg-slate-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex flex-wrap items-center gap-3 rounded-t-2xl border-b border-slate-200 bg-white px-5 py-3">
          <span className="text-[17px] font-bold text-slate-800">#{d.id}</span>
          <SrcBadge s={d.source} />
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600">
            🏬 {d.region === "kr" ? "Kho Hàn" : "Kho VN"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${STATUS_COLOR[d.status] ?? "bg-slate-100 text-slate-600"}`}>
              {d.status}
            </span>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
              <IconXCircle width={20} height={20} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="grid gap-4 p-5 lg:grid-cols-[1.6fr_1fr]">
          {/* LEFT */}
          <div className="space-y-4">
            <Card title="Sản phẩm">
              <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                <div className="grid h-14 w-14 flex-none place-items-center rounded-lg bg-cream-soft text-2xl text-gold/50">❋</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-emerald-600">{d.vc || `TR-${d.id}`}</div>
                  <div className="truncate text-[14px] font-medium text-slate-800">{d.product ?? "Set bánh Trung Thu (6 vị)"}</div>
                  <div className="mt-0.5 text-[12px] text-slate-400">Thuế 0% · KM {money(0)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-semibold text-slate-800">{money(goods)}</div>
                  {shipFee > 0 && (
                    <div className="mt-0.5 text-[11.5px] text-slate-400">+ ship {money(shipFee)}</div>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Thanh toán">
              {/* Tổng phải thu cố định — hai ô dưới chỉ chia nhau con số này */}
              <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
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

              <Field label="Trả trước (đã CK)">
                <NumInput value={d.prepaid} onChange={(v) => setSplit("prepaid", v)} />
              </Field>
              <Field label="COD (thu hộ)">
                <NumInput value={d.cod} onChange={(v) => setSplit("cod", v)} />
              </Field>
              <p className="px-1 pb-1 text-[11.5px] text-slate-400">
                Sửa một ô thì ô kia tự bù — tổng phải thu và phí ship không đổi.
              </p>
              <div className="flex justify-between py-1 text-[13px]">
                <span className="text-slate-500">Cước VC trả hãng</span>
                <span className="font-medium text-slate-700">{money(d.cuoc_vc)}</span>
              </div>
              <div className={`mt-2 rounded-lg px-3 py-2 text-[13px] font-medium ${paidFull ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {paidFull ? "✓ Đã thanh toán đủ" : `Cần thu COD ${money(d.cod)}`}
              </div>
            </Card>

            <Card title="Ghi chú">
              <textarea
                value={d.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="Viết ghi chú…"
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-400"
              />
            </Card>

            {/* LỊCH SỬ CẬP NHẬT */}
            <Card title={`Lịch sử cập nhật${history.length ? ` (${history.length})` : ""}`}>
              {history.length === 0 ? (
                <p className="text-[13px] text-slate-400">Chưa có thay đổi nào.</p>
              ) : (
                <ol className="space-y-3">
                  {history.map((h, i) => (
                    <li key={i} className="border-l-2 border-blue-200 pl-3">
                      <div className="text-[12px] text-slate-400">
                        {h.at} · <b className="text-slate-600">{h.by}</b>
                      </div>
                      <ul className="mt-0.5 list-disc pl-4 text-[13px] text-slate-700">
                        {h.changes.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            <Card title="Thông tin">
              <Field label="Trạng thái">
                <select
                  value={d.status}
                  onChange={(e) => set("status", e.target.value as Status)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px]"
                >
                  {ALL_STATUS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="NV chăm sóc">
                <TextInput value={d.assignee ?? "Do"} onChange={(v) => set("assignee", v)} />
              </Field>
              <div className="flex justify-between py-1 text-[13px]">
                <span className="text-slate-500">Tạo lúc</span>
                <span className="font-medium text-slate-700">{d.created ?? "28/09/2025 23:57"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.tags.length ? (
                  d.tags.map((t) => (
                    <span key={t} className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">{t}</span>
                  ))
                ) : (
                  <span className="text-[12px] text-slate-400">Chưa gắn thẻ</span>
                )}
              </div>
            </Card>

            <Card title="Khách hàng">
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <div className="text-[14px] font-semibold text-slate-800">{d.customer}</div>
                <div className="text-[13px] font-medium text-blue-600">{d.phone}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[12px]">
                  <div>Tổng chi: <b className="text-slate-800">{money(total)}</b></div>
                  <div>Thành công: <b className="text-emerald-600">{d.successOrders ?? "1/1 đơn"}</b></div>
                  <div className="col-span-2">Lần mua cuối: <b className="text-slate-700">{d.lastBuy ?? "10:50 01/10/2025"}</b></div>
                </div>
              </div>
            </Card>

            <Card title="Nhận hàng">
              <Field label="Người nhận">
                <TextInput value={d.recipient} onChange={(v) => set("recipient", v)} />
              </Field>
              <Field label="SĐT">
                <TextInput value={d.phone} onChange={(v) => set("phone", v)} />
              </Field>
              <Field label="Địa chỉ">
                <TextInput value={d.address} onChange={(v) => set("address", v)} />
              </Field>
              <Field label="ĐVVC">
                <select
                  value={d.carrier}
                  onChange={(e) => set("carrier", e.target.value as OrderRow["carrier"])}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px]"
                >
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>{c || "—"}</option>
                  ))}
                </select>
              </Field>
              <Field label="Dự kiến nhận">
                <input
                  type="date"
                  value={d.expected ?? ""}
                  onChange={(e) => set("expected", e.target.value)}
                  className="w-48 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-[13px] text-slate-800 outline-none focus:border-blue-400"
                />
              </Field>
            </Card>
          </div>
        </div>

        {/* footer */}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-4 rounded-b-2xl border-t border-slate-200 bg-white px-5 py-3">
          <div className="text-[13px] text-slate-600">Tiền cần thu: <b className="text-slate-900">{money(d.cod)}</b></div>
          <div className="text-[13px] text-slate-600">COD: <b className={d.cod ? "text-rose-600" : "text-slate-900"}>{money(d.cod)}</b></div>
          {saved && <span className="text-[13px] font-medium text-emerald-600">✓ Đã lưu</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">
              Đóng
            </button>
            <button onClick={handleSave} className="rounded-lg bg-blue-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-blue-700">
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-[13px] font-semibold text-slate-800">{title}</h4>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="flex-none text-slate-500">{label}</span>
      {children}
    </div>
  );
}
function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-48 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-[13px] text-slate-800 outline-none focus:border-blue-400"
    />
  );
}
function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-40 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-[13px] font-medium text-slate-800 outline-none focus:border-blue-400"
    />
  );
}
