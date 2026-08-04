"use client";

import type { OrderRow } from "@/lib/ordersMock";
import { STATUS_COLOR } from "@/lib/ordersMock";
import {
  IconFacebook,
  IconGlobe,
  IconStore,
  IconTruck,
  IconXCircle,
} from "@/components/icons";

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

export default function OrderDetailModal({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const r = order;
  const total = r.prepaid + r.cod;
  const paidFull = r.cod === 0 && r.prepaid > 0;
  const needCollect = r.cod;

  const created = r.created ?? "28/09/2025 23:57";
  const assignee = r.assignee ?? "Do";
  const productName = r.product ?? "Set bánh Trung Thu (6 vị)";
  const sku = r.vc || `TR-${r.id}`;
  const gender = r.gender ?? "Nữ";
  const success = r.successOrders ?? "1/1 đơn";
  const lastBuy = r.lastBuy ?? "10:50 01/10/2025";
  const money = (v: number) => nat(v, r.region);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="my-4 w-full max-w-5xl rounded-2xl bg-slate-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex flex-wrap items-center gap-3 rounded-t-2xl border-b border-slate-200 bg-white px-5 py-3">
          <span className="text-[17px] font-bold text-slate-800">#{r.id}</span>
          <SrcBadge s={r.source} />
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600">
            🏬 {r.region === "kr" ? "Kho Hàn" : "Kho VN"}
          </span>
          <span className="text-[12px] text-slate-400">Phân công: <b className="text-slate-600">{assignee}</b></span>
          <div className="ml-auto flex items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-600"}`}>
              {r.status}
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
            {/* sản phẩm */}
            <Card title="Sản phẩm">
              <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                <div className="grid h-14 w-14 flex-none place-items-center rounded-lg bg-cream-soft text-2xl text-gold/50">❋</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-emerald-600">{sku}</div>
                  <div className="truncate text-[14px] font-medium text-slate-800">{productName}</div>
                  <div className="mt-0.5 text-[12px] text-slate-400">Thuế 0% · KM {money(0)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] text-slate-500">{money(total)} × 1</div>
                  <div className="text-[15px] font-semibold text-slate-800">{money(total)}</div>
                </div>
              </div>
            </Card>

            {/* giá trị đơn */}
            <Card title="Giá trị đơn hàng">
              <Row k="Tổng tiền hàng" v={money(total)} />
              <Row k="Giảm giá" v={money(0)} />
              <Row k="Phí vận chuyển (thu khách)" v={money(r.phi_vc_thu_khach)} />
              <Row k="Phụ thu" v={money(0)} />
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-[15px] font-bold text-slate-800">
                <span>Tổng số tiền</span>
                <span>{money(total + r.phi_vc_thu_khach)}</span>
              </div>
            </Card>

            {/* thanh toán */}
            <Card title="Thanh toán">
              <Row k="Trả trước (đã CK)" v={money(r.prepaid)} />
              <Row k="COD (thu hộ)" v={money(r.cod)} />
              <Row k="Cước VC (trả ĐVVC)" v={money(r.cuoc_vc)} />
              <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium ${paidFull ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {paidFull ? "✓ Đã thanh toán đủ" : `Cần thu COD ${money(needCollect)}`}
              </div>
            </Card>

            {/* ghi chú */}
            <Card title="Ghi chú">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600">
                {r.note || <span className="text-slate-400">Chưa có ghi chú</span>}
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            {/* thông tin */}
            <Card title="Thông tin">
              <Row k="Tạo lúc" v={created} />
              <Row k="NV chăm sóc" v={assignee} />
              <Row k="Nguồn" v={r.source === "web" ? "Website" : r.source === "facebook" ? "Facebook" : "Tại quầy"} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.tags.length ? (
                  r.tags.map((t) => (
                    <span key={t} className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">{t}</span>
                  ))
                ) : (
                  <span className="text-[12px] text-slate-400">Chưa gắn thẻ</span>
                )}
              </div>
            </Card>

            {/* khách hàng */}
            <Card title="Khách hàng">
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-semibold text-slate-800">{r.customer}</div>
                    <div className="text-[13px] font-medium text-blue-600">{r.phone}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">{gender}</span>
                    {r.carrier && (
                      <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">{r.carrier}</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <div>Tổng chi: <b className="text-slate-800">{money(total)}</b></div>
                  <div>Thành công: <b className="text-emerald-600">{success}</b></div>
                  <div className="col-span-2">Lần mua cuối: <b className="text-slate-700">{lastBuy}</b></div>
                </div>
              </div>
            </Card>

            {/* nhận hàng */}
            <Card title="Nhận hàng">
              <div className="flex items-start gap-2 text-[13px] text-slate-600">
                <span className="mt-0.5">{r.region === "kr" ? "🇰🇷" : "🇻🇳"}</span>
                <div>
                  <div className="font-medium text-slate-800">{r.recipient}</div>
                  <div className="text-slate-500">{r.address}</div>
                </div>
              </div>
              <Row k="ĐVVC" v={r.carrier || "—"} />
              <Row k="Mã vận chuyển" v={r.vc || "—"} />
              <Row k="Dự kiến nhận" v={r.expected ?? "—"} />
            </Card>
          </div>
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center gap-4 rounded-b-2xl border-t border-slate-200 bg-white px-5 py-3">
          <div className="text-[13px] text-slate-600">
            Tiền cần thu: <b className="text-slate-900">{money(needCollect)}</b>
          </div>
          <div className="text-[13px] text-slate-600">
            COD: <b className={r.cod ? "text-rose-600" : "text-slate-900"}>{money(r.cod)}</b>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium ${paidFull ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              <IconTruck width={15} height={15} /> {r.status}
            </span>
            <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">
              Đóng
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700">
              Lưu
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
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1 text-[13px]">
      <span className="text-slate-500">{k}</span>
      <span className="font-medium text-slate-700">{v}</span>
    </div>
  );
}
