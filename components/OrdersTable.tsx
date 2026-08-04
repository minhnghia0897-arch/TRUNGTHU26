"use client";

import { useMemo, useState } from "react";
import {
  ORDERS,
  PIPELINE,
  STATUS_COLOR,
  type OrderRow,
  type OrderSource,
  type Status,
} from "@/lib/ordersMock";
import {
  IconSearch,
  IconFacebook,
  IconGlobe,
  IconStore,
  IconChevronDown,
  IconTruck,
  IconDollar,
  IconXCircle,
  IconReturn,
  IconCopyDoc,
  IconCheck,
} from "@/components/icons";

const FX = 18.5; // KRW↔VND
type Cur = "krw" | "vnd";
type SourceFilter = "all" | OrderSource;

// đổi mọi số về KRW base rồi hiển thị theo tiền tệ chọn (hợp nhất §15)
const toKrw = (v: number, region: "vn" | "kr") => (region === "kr" ? v : v / FX);

function SourceIcon({ s }: { s: OrderSource }) {
  if (s === "facebook") return <IconFacebook className="text-[#1877F2]" width={15} height={15} />;
  if (s === "web") return <IconGlobe className="text-gold-deep" width={15} height={15} />;
  return <IconStore className="text-slate-500" width={15} height={15} />;
}

// menu đổi trạng thái (như Pancake)
const MENU: { label: Status | "Tạo trùng lặp"; Icon: typeof IconTruck }[] = [
  { label: "Đã thu tiền", Icon: IconDollar },
  { label: "Khách trả lại", Icon: IconReturn },
  { label: "Đã hoàn toàn bộ", Icon: IconReturn },
  { label: "Đã gửi hàng", Icon: IconTruck },
  { label: "Huỷ đơn", Icon: IconXCircle },
  { label: "Tạo trùng lặp", Icon: IconCopyDoc },
];

export default function OrdersTable() {
  const [rows, setRows] = useState<OrderRow[]>(ORDERS);
  const [source, setSource] = useState<SourceFilter>("all");
  const [warehouse, setWarehouse] = useState<"all" | "vn" | "kr">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [q, setQ] = useState("");
  const [cur, setCur] = useState<Cur>("krw");
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);

  const money = (krw: number) =>
    cur === "vnd"
      ? Math.round(krw * FX).toLocaleString("vi-VN") + "đ"
      : "₩" + Math.round(krw).toLocaleString("en-US");

  // lọc theo nguồn + kho + tìm kiếm (không tính status — để đếm tab)
  const base = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      const okS = source === "all" || r.source === source;
      const okW = warehouse === "all" || r.region === warehouse;
      const okQ =
        !query ||
        [r.id, r.vc, r.customer, r.recipient, r.phone, r.address, r.note, ...r.tags]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return okS && okW && okQ;
    });
  }, [rows, source, warehouse, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length };
    for (const s of PIPELINE) c[s] = 0;
    for (const r of base) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [base]);

  const list = status === "all" ? base : base.filter((r) => r.status === status);

  const totals = list.reduce(
    (a, r) => ({
      cod: a.cod + toKrw(r.cod, r.region),
      prepaid: a.prepaid + toKrw(r.prepaid, r.region),
      cuoc: a.cuoc + toKrw(r.cuoc_vc, r.region),
      phi: a.phi + toKrw(r.phi_vc_thu_khach, r.region),
    }),
    { cod: 0, prepaid: 0, cuoc: 0, phi: 0 },
  );

  const setStatusOf = (id: number, s: Status) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: s } : r)));
    setMenu(null);
  };

  const SOURCE_TABS: [SourceFilter, string][] = [
    ["all", "Tất cả"],
    ["web", "Online"],
    ["facebook", "Facebook"],
    ["pos", "Tại quầy"],
  ];

  return (
    <main className="min-h-screen bg-cream" onClick={() => menu && setMenu(null)}>
      {/* topbar */}
      <div className="flex flex-wrap items-center gap-3 bg-navy px-4 py-3 text-cream">
        <a href="/dashboard" className="title-heritage text-sm tracking-[0.16em] text-cream">
          Trăng Rằm
        </a>
        <span className="text-xs opacity-60">· Quản lý đơn hàng</span>
        <div className="flex-1" />
        <div className="relative w-full max-w-md">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy/40" width={16} height={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mã đơn / Mã VC / Tên / Địa chỉ / SĐT / Ghi chú"
            className="w-full rounded-md border border-line bg-white py-2 pl-8 pr-3 text-[13px] text-ink"
          />
        </div>
        <select
          value={warehouse}
          onChange={(e) => setWarehouse(e.target.value as typeof warehouse)}
          className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px] text-ink"
        >
          <option value="all">Tất cả các kho</option>
          <option value="kr">🇰🇷 Kho Hàn</option>
          <option value="vn">🇻🇳 Kho VN</option>
        </select>
        <select
          value={cur}
          onChange={(e) => setCur(e.target.value as Cur)}
          className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px] text-ink"
        >
          <option value="krw">₩ KRW</option>
          <option value="vnd">đ VND</option>
        </select>
      </div>

      {/* source tabs */}
      <div className="flex gap-1 border-b border-line bg-white px-4 pt-2">
        {SOURCE_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSource(key)}
            className={`rounded-t-md px-3 py-2 text-[13px] font-medium ${source === key ? "bg-cream text-navy" : "text-ink/55 hover:text-navy"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* status count tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-line bg-white px-4 py-2 text-[13px]">
        <StatusTab label="Tất cả" count={counts.all} active={status === "all"} onClick={() => setStatus("all")} />
        {PIPELINE.map((s) => (
          <StatusTab key={s} label={s} count={counts[s] ?? 0} active={status === s} onClick={() => setStatus(s)} />
        ))}
      </div>

      {/* table */}
      <div className="overflow-x-auto px-4 py-3">
        <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="border-b border-line px-2 py-2">ID</th>
              <th className="border-b border-line px-2 py-2">VC</th>
              <th className="border-b border-line px-2 py-2">Thẻ</th>
              <th className="border-b border-line px-2 py-2">Ghi chú</th>
              <th className="border-b border-line px-2 py-2">Khách hàng</th>
              <th className="border-b border-line px-2 py-2">Người nhận</th>
              <th className="border-b border-line px-2 py-2">SĐT</th>
              <th className="border-b border-line px-2 py-2">Nhận hàng</th>
              <th className="border-b border-line px-2 py-2 text-right">Trả trước</th>
              <th className="border-b border-line px-2 py-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="hover:bg-cream-soft">
                <td className="whitespace-nowrap border-b border-line px-2 py-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-navy">
                    <SourceIcon s={r.source} /> {r.id}
                  </span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-2 py-2 text-ink/70">{r.vc || "—"}</td>
                <td className="border-b border-line px-2 py-2">
                  {r.tags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] text-gold-deep">{t}</span>
                      ))}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-[120px] truncate border-b border-line px-2 py-2 text-ink/60" title={r.note}>{r.note || "—"}</td>
                <td className="whitespace-nowrap border-b border-line px-2 py-2 text-ink">{r.customer}</td>
                <td className="whitespace-nowrap border-b border-line px-2 py-2 text-ink">{r.recipient}</td>
                <td className="whitespace-nowrap border-b border-line px-2 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-navy">{r.phone}</span>
                    {r.carrier && (
                      <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink/60">{r.carrier}</span>
                    )}
                  </span>
                </td>
                <td className="max-w-[180px] truncate border-b border-line px-2 py-2 text-ink/70" title={r.address}>
                  <span className="mr-1">{r.region === "kr" ? "🇰🇷" : "🇻🇳"}</span>
                  {r.address}
                </td>
                <td className="whitespace-nowrap border-b border-line px-2 py-2 text-right font-medium text-gold-deep">
                  {money(toKrw(r.prepaid, r.region))}
                </td>
                <td className="border-b border-line px-2 py-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenu(menu?.id === r.id ? null : { id: r.id, x: rect.left, y: rect.bottom + 4 });
                    }}
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 text-[12px] font-semibold ${STATUS_COLOR[r.status] ?? "bg-slate-200 text-slate-700"}`}
                  >
                    {r.status} <IconChevronDown width={13} height={13} />
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-8 text-center text-ink/50">
                  Không có đơn khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* footer tổng tài chính */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-white px-4 py-2.5 text-[13px]">
        <span className="font-semibold text-navy">{list.length} đơn</span>
        <span>COD: <b className="text-navy">{money(totals.cod)}</b></span>
        <span>Trả trước: <b className="text-navy">{money(totals.prepaid)}</b></span>
        <span>Cước VC: <b className="text-navy">{money(totals.cuoc)}</b></span>
        <span>Phí VC thu khách: <b className="text-navy">{money(totals.phi)}</b></span>
        <div className="flex-1" />
        <a href="/dashboard" className="text-[12px] text-gold-deep underline">← Về dashboard</a>
      </div>

      {/* menu đổi trạng thái */}
      {menu && (
        <div
          className="fixed z-50 w-52 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-xl"
          style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 220), top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {MENU.map(({ label, Icon }) => (
            <button
              key={label}
              onClick={() => {
                if (label === "Tạo trùng lặp") {
                  setMenu(null);
                  return;
                }
                setStatusOf(menu.id, label as Status);
              }}
              className="flex w-full items-center gap-2.5 border-b border-line/60 px-3 py-2.5 text-left text-[13px] text-ink last:border-0 hover:bg-cream-soft"
            >
              <span className="text-ink/60">
                <Icon width={16} height={16} />
              </span>
              {label}
            </button>
          ))}
          <div className="border-t border-line px-3 py-1.5 text-[11px] text-ink/45">
            Bản demo · thật sẽ đồng bộ Pancake
          </div>
        </div>
      )}
    </main>
  );
}

function StatusTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-medium ${active ? "bg-navy text-cream" : "text-ink/60 hover:bg-cream-soft"}`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-cream/25" : "bg-line/60 text-ink/60"}`}>{count}</span>
    </button>
  );
}
