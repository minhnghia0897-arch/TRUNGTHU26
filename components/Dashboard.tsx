"use client";

import { useMemo, useState } from "react";
import type { DashboardData, DashShipment } from "@/lib/dashboard";
import {
  IconGrid,
  IconTruck,
  IconChevron,
  IconArrowRight,
  IconSearch,
} from "@/components/icons";

type Cur = "krw" | "vnd";
type Range = "today" | "7d" | "month";

const PILL: Record<DashShipment["pill"], string> = {
  new: "bg-slate-100 text-slate-600",
  mid: "bg-amber-100 text-amber-700",
  ship: "bg-orange-100 text-orange-700",
  done: "bg-emerald-100 text-emerald-700",
  late: "bg-rose-100 text-rose-700",
  fail: "bg-rose-100 text-rose-700 ring-1 ring-rose-300",
};

export default function Dashboard({ data }: { data: DashboardData }) {
  const [cur, setCur] = useState<Cur>("krw");
  const [range, setRange] = useState<Range>("7d");
  const [region, setRegion] = useState<"all" | "vn" | "kr">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const fx = data.fxKrwVnd;
  const money = (krw: number) =>
    cur === "vnd"
      ? Math.round(krw * fx).toLocaleString("vi-VN") + "đ"
      : "₩" + Math.round(krw).toLocaleString("en-US");

  const customers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.customers.filter((c) => {
      const okQ = !q || [c.name, c.phone, c.code].join(" ").toLowerCase().includes(q);
      const okR = region === "all" || c.shipments.some((s) => s.region === region);
      return okQ && okR;
    });
  }, [data.customers, search, region]);

  const maxDaily = Math.max(...data.daily.map((d) => d.v));
  const k = data.kpi;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-700">
      {/* topbar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white">
              <IconGrid width={17} height={17} />
            </span>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-slate-800">Trăng Rằm</div>
              <div className="text-[11px] text-slate-400">Bảng điều hành</div>
            </div>
          </div>
          <div className="flex-1" />
          <a
            href="/dashboard/don-hang"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
          >
            Quản lý đơn hàng <IconArrowRight width={15} height={15} />
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-[1120px] px-5 pb-16 pt-5">
        {/* filters */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
            {(["today", "7d", "month"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3.5 py-2 text-[13px] font-medium transition ${range === r ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                {r === "today" ? "Hôm nay" : r === "7d" ? "7 ngày" : "Tháng"}
              </button>
            ))}
          </div>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as typeof region)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
          >
            <option value="all">Tất cả vùng</option>
            <option value="vn">🇻🇳 VN</option>
            <option value="kr">🇰🇷 Hàn</option>
          </select>
          <select
            value={cur}
            onChange={(e) => setCur(e.target.value as Cur)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
          >
            <option value="krw">₩ KRW</option>
            <option value="vnd">đ VND</option>
          </select>
          <div className="relative ml-auto">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width={15} height={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên / SĐT / mã đơn"
              className="w-56 rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px]"
            />
          </div>
        </div>

        {/* warn */}
        {k.pushFailed > 0 && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-white">!</span>
            <b>{k.pushFailed} đơn</b> đẩy Pancake thất bại / một phần — đẩy lại bằng đúng{" "}
            <code className="rounded bg-amber-100 px-1">idempotency_key</code>, không sinh đơn mới.
          </div>
        )}

        {/* kpi */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi lab="Doanh số hợp nhất" val={money(k.revenueKrw)} sub="▲ 18% vs kỳ trước" tone="up" />
          <Kpi lab="Số đơn web" val={String(k.orders)} sub={`${k.packages} kiện`} />
          <Kpi lab="Kiện theo vùng" val={`${k.pkgKr}🇰🇷 · ${k.pkgVn}🇻🇳`} sub="tách 2 kho" />
          <Kpi lab="Đang vận chuyển" val={String(k.shipping)} sub="theo webhook" mirror />
          <Kpi lab="Cảnh báo tồn" val={String(k.lowStock)} sub="dưới ngưỡng" mirror alert />
          <Kpi lab="Lỗi đẩy Pancake" val={String(k.pushFailed)} sub="cần đẩy lại" alert />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* customers */}
          <Panel title="Đơn theo khách" src="web-native">
            {customers.length === 0 ? (
              <div className="py-6 text-center text-slate-400">Không có đơn khớp bộ lọc.</div>
            ) : (
              <div className="space-y-2.5">
                {customers.map((c, ci) => (
                  <div key={ci} className="overflow-hidden rounded-lg border border-slate-200">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [ci]: !o[ci] }))}
                      className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
                    >
                      <span className={`text-blue-500 transition-transform ${open[ci] ? "rotate-90" : ""}`}>
                        <IconChevron width={16} height={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-slate-800">{c.name}</div>
                        <div className="text-[12px] text-slate-400">
                          {c.phone} · {c.code} · {c.shipments.length} kiện
                        </div>
                      </div>
                      <div className="flex-1" />
                      <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                        {c.region === "kr" ? "Đặt ở Hàn" : "Đặt ở VN"}
                      </span>
                      <span className="font-semibold text-slate-800">{money(c.totalKrw)}</span>
                    </button>
                    {open[ci] && (
                      <div className="space-y-2 bg-white px-4 py-3">
                        {c.shipments.map((s, i) => (
                          <div key={i} className="rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 p-3">
                            <div className="flex flex-wrap items-center gap-2 text-[13px]">
                              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                                <IconTruck width={15} height={15} className="text-slate-400" />
                                Kiện {i + 1} · {s.to}
                              </span>
                              <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500">{s.warehouse}</span>
                              <span className="flex-1" />
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${PILL[s.pill]}`}>{s.status}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
                              <span>ĐVVC: <b className="text-slate-700">{s.carrier}</b></span>
                              <span>VC: {s.vc}</span>
                              <span>Hẹn giao: {s.desired}</span>
                              <span>Trả trước: {money(s.prepaid)}</span>
                              <span>COD: {money(s.cod)}</span>
                              <span>Cước VC: {money(s.cuoc)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="space-y-4">
            <Panel title="Doanh số theo ngày" src="web-native">
              <div className="flex h-32 items-end gap-2 pt-1">
                {data.daily.map((d) => (
                  <div key={d.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <div
                      className="w-full rounded-t bg-blue-500/90"
                      style={{ height: `${(d.v / maxDaily) * 100}%`, minHeight: 3 }}
                      title={money(d.v)}
                    />
                    <div className="text-[10px] text-slate-400">{d.d}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Tồn kho" src="mirror" mirror>
              <div className="divide-y divide-slate-100">
                {data.inventory.map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2.5 text-[13px]">
                    <span className="text-slate-600">{i.name}</span>
                    <span className="flex items-center gap-2">
                      <b className="text-slate-800">{i.qty}</b>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                          i.status === "ok"
                            ? "bg-emerald-100 text-emerald-700"
                            : i.status === "low"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {i.status === "ok" ? "Đủ" : i.status === "low" ? "Sắp hết" : "Hết"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Nguồn chân lý = Pancake. Web chỉ hiển thị + cảnh báo, không sửa.
              </p>
            </Panel>
          </div>
        </div>

        <div className="mt-5 text-center text-[11px] text-slate-400">
          Nguồn web-native: {data.source === "supabase" ? "Supabase" : "seed (chưa cấu hình / chưa có đơn)"}
        </div>
      </div>
    </main>
  );
}

function Kpi({
  lab,
  val,
  sub,
  tone,
  mirror,
  alert,
}: {
  lab: string;
  val: string;
  sub: string;
  tone?: "up";
  mirror?: boolean;
  alert?: boolean;
}) {
  return (
    <div className={`relative rounded-xl border bg-white p-4 ${alert ? "border-amber-200" : "border-slate-200"}`}>
      <div className={`text-[11px] font-medium uppercase tracking-wide text-slate-400 ${mirror ? "pr-14" : ""}`}>{lab}</div>
      <div className={`mt-1.5 text-2xl font-bold ${alert ? "text-amber-600" : "text-slate-800"}`}>{val}</div>
      <div className={`mt-1 text-[12px] ${tone === "up" ? "text-emerald-600" : "text-slate-400"}`}>{sub}</div>
      {mirror && (
        <span className="absolute right-3 top-3 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">
          Pancake
        </span>
      )}
    </div>
  );
}

function Panel({
  title,
  src,
  mirror,
  children,
}: {
  title: string;
  src: string;
  mirror?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 flex items-center justify-between text-[14px] font-semibold text-slate-800">
        {title}
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${mirror ? "bg-indigo-50 text-indigo-500" : "bg-blue-50 text-blue-600"}`}
        >
          {mirror ? "Pancake · mirror" : "web-native"}
        </span>
      </h3>
      {children}
    </section>
  );
}
