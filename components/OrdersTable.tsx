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
} from "@/components/icons";

const FX = 18.5;
type Cur = "krw" | "vnd";
type SourceFilter = "all" | OrderSource;

const toKrw = (v: number, region: "vn" | "kr") => (region === "kr" ? v : v / FX);

function SourceIcon({ s }: { s: OrderSource }) {
  if (s === "facebook") return <IconFacebook className="text-[#1877F2]" width={15} height={15} />;
  if (s === "web") return <IconGlobe className="text-emerald-500" width={15} height={15} />;
  return <IconStore className="text-slate-400" width={15} height={15} />;
}

const MENU: { label: Status | "Tạo trùng lặp"; Icon: typeof IconTruck; danger?: boolean }[] = [
  { label: "Đã thu tiền", Icon: IconDollar },
  { label: "Khách trả lại", Icon: IconReturn },
  { label: "Đã hoàn toàn bộ", Icon: IconReturn },
  { label: "Đã gửi hàng", Icon: IconTruck },
  { label: "Huỷ đơn", Icon: IconXCircle, danger: true },
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

  const baseRows = useMemo(() => {
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
    const c: Record<string, number> = { all: baseRows.length };
    for (const s of PIPELINE) c[s] = 0;
    for (const r of baseRows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [baseRows]);

  const list = status === "all" ? baseRows : baseRows.filter((r) => r.status === status);

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
    <main className="min-h-screen bg-slate-50 text-slate-700" onClick={() => menu && setMenu(null)}>
      {/* topbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <a href="/dashboard" className="text-[15px] font-semibold text-slate-800">
          Trăng Rằm
        </a>
        <span className="text-[13px] text-slate-400">· Quản lý đơn hàng</span>
        <div className="relative ml-auto w-full max-w-md">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width={16} height={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mã đơn / Mã VC / Tên / Địa chỉ / SĐT / Ghi chú"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px]"
          />
        </div>
        <select
          value={warehouse}
          onChange={(e) => setWarehouse(e.target.value as typeof warehouse)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
        >
          <option value="all">Tất cả các kho</option>
          <option value="kr">🇰🇷 Kho Hàn</option>
          <option value="vn">🇻🇳 Kho VN</option>
        </select>
        <select
          value={cur}
          onChange={(e) => setCur(e.target.value as Cur)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
        >
          <option value="krw">₩ KRW</option>
          <option value="vnd">đ VND</option>
        </select>
      </div>

      {/* source tabs */}
      <div className="flex gap-6 border-b border-slate-200 bg-white px-5">
        {SOURCE_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSource(key)}
            className={`border-b-2 py-2.5 text-[13px] font-medium transition ${source === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* status count tabs */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-5 py-2.5">
        <StatusTab label="Tất cả" count={counts.all} active={status === "all"} onClick={() => setStatus("all")} />
        {PIPELINE.map((s) => (
          <StatusTab key={s} label={s} count={counts[s] ?? 0} active={status === s} onClick={() => setStatus(s)} />
        ))}
      </div>

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <Th>ID</Th>
              <Th>VC</Th>
              <Th>Thẻ</Th>
              <Th>Ghi chú</Th>
              <Th>Khách hàng</Th>
              <Th>Người nhận</Th>
              <Th>SĐT</Th>
              <Th>Nhận hàng</Th>
              <Th className="text-right">Trả trước</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="bg-white hover:bg-slate-50">
                <Td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                    <SourceIcon s={r.source} /> {r.id}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-slate-500">{r.vc || "—"}</Td>
                <Td>
                  {r.tags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">{t}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </Td>
                <Td className="max-w-[120px] truncate text-slate-500" title={r.note}>{r.note || <span className="text-slate-300">—</span>}</Td>
                <Td className="whitespace-nowrap text-slate-700">{r.customer}</Td>
                <Td className="whitespace-nowrap text-slate-700">{r.recipient}</Td>
                <Td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-medium text-blue-600">{r.phone}</span>
                    {r.carrier && (
                      <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">{r.carrier}</span>
                    )}
                  </span>
                </Td>
                <Td className="max-w-[190px] truncate text-slate-600" title={r.address}>
                  <span className="mr-1">{r.region === "kr" ? "🇰🇷" : "🇻🇳"}</span>
                  {r.address}
                </Td>
                <Td className="whitespace-nowrap text-right font-medium text-slate-700">
                  {money(toKrw(r.prepaid, r.region))}
                </Td>
                <Td>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenu(menu?.id === r.id ? null : { id: r.id, x: rect.left, y: rect.bottom + 4 });
                    }}
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-semibold ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {r.status} <IconChevronDown width={13} height={13} />
                  </button>
                </Td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={10} className="bg-white px-4 py-10 text-center text-slate-400">
                  Không có đơn khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* footer */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-200 bg-white px-5 py-3 text-[13px]">
        <span className="font-semibold text-slate-800">{list.length} đơn</span>
        <span className="text-slate-500">COD: <b className="text-slate-800">{money(totals.cod)}</b></span>
        <span className="text-slate-500">Trả trước: <b className="text-slate-800">{money(totals.prepaid)}</b></span>
        <span className="text-slate-500">Cước VC: <b className="text-slate-800">{money(totals.cuoc)}</b></span>
        <span className="text-slate-500">Phí VC thu khách: <b className="text-slate-800">{money(totals.phi)}</b></span>
        <div className="flex-1" />
        <a href="/dashboard" className="text-[12px] font-medium text-blue-600 hover:underline">← Về dashboard</a>
      </div>

      {/* menu đổi trạng thái */}
      {menu && (
        <div
          className="fixed z-50 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 220), top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {MENU.map(({ label, Icon, danger }) => (
            <button
              key={label}
              onClick={() => {
                if (label === "Tạo trùng lặp") return setMenu(null);
                setStatusOf(menu.id, label as Status);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] hover:bg-slate-50 ${danger ? "text-rose-600" : "text-slate-700"}`}
            >
              <Icon width={16} height={16} className={danger ? "text-rose-400" : "text-slate-400"} />
              {label}
            </button>
          ))}
          <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
            Bản demo · thật sẽ đồng bộ Pancake
          </div>
        </div>
      )}
    </main>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`border-b border-slate-200 px-3 py-2.5 ${className}`}>{children}</th>;
}
function Td({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`border-b border-slate-100 px-3 py-2.5 ${className}`} title={title}>
      {children}
    </td>
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
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${active ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
    >
      {label}
      <span className={`rounded px-1.5 text-[11px] ${active ? "bg-white/25" : "bg-slate-200 text-slate-500"}`}>{count}</span>
    </button>
  );
}
