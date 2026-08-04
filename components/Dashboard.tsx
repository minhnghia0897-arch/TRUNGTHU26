"use client";

import { useMemo, useState } from "react";
import type { DashboardData, DashShipment } from "@/lib/dashboard";

type Cur = "krw" | "vnd";
type Range = "today" | "7d" | "month";

const PILL_CLASS: Record<DashShipment["pill"], string> = {
  new: "bg-[#eee] text-[#555]",
  mid: "bg-[#fff3e0] text-[#b8862f]",
  ship: "bg-[#e7f0f7] text-[#2c5a8a]",
  done: "bg-[#eef6ef] text-[#3f7d4e]",
  late: "bg-[#fbeaea] text-[#a33]",
  fail: "bg-[#fbeaea] text-[#a33] border border-[#a33]",
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
    <main className="mx-auto min-h-screen bg-cream">
      {/* topbar */}
      <div className="bg-maroon-deep px-4 py-3.5 text-cream">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3.5">
          <div>
            <div className="title-heritage text-base tracking-[0.16em] text-cream">Trăng Rằm</div>
            <div className="font-body text-[10px] opacity-60">Bảng điều hành lớp web</div>
          </div>
          <div className="flex-1" />
          <a
            href="/dashboard/don-hang"
            className="rounded-full bg-gold px-4 py-2 text-[12px] font-semibold text-navy-deep"
          >
            Quản lý đơn hàng →
          </a>
          <div className="hidden text-[10.5px] opacity-70 lg:block">
            Tồn kho &amp; vận chuyển <b className="text-gold">mirror Pancake</b>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-4 pb-16">
        {/* filters */}
        <div className="my-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded border border-line bg-white">
            {(["today", "7d", "month"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-2 font-serif text-[11px] uppercase tracking-wide ${range === r ? "bg-maroon text-cream" : "text-maroon"}`}
              >
                {r === "today" ? "Hôm nay" : r === "7d" ? "7 ngày" : "Tháng"}
              </button>
            ))}
          </div>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as typeof region)}
            className="rounded border border-line bg-white px-2.5 py-2 text-[13px]"
          >
            <option value="all">Tất cả vùng</option>
            <option value="vn">🇻🇳 VN</option>
            <option value="kr">🇰🇷 Hàn</option>
          </select>
          <select
            value={cur}
            onChange={(e) => setCur(e.target.value as Cur)}
            className="rounded border border-line bg-white px-2.5 py-2 text-[13px]"
          >
            <option value="krw">Hiển thị ₩ KRW</option>
            <option value="vnd">Hiển thị đ VND</option>
          </select>
          <div className="flex-1" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên / SĐT / mã đơn"
            className="min-w-[200px] rounded border border-line bg-white px-2.5 py-2 text-[13px]"
          />
        </div>

        {/* warn */}
        {k.pushFailed > 0 && (
          <div className="mb-4 flex items-center gap-2.5 rounded border border-gold bg-[#fffaf0] px-3.5 py-2.5 text-[12.5px] text-[#b8862f]">
            ⚠ <b>{k.pushFailed} đơn</b> đẩy Pancake thất bại / một phần — đẩy lại bằng đúng{" "}
            <code>idempotency_key</code>, không sinh đơn mới.
          </div>
        )}

        {/* kpi */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi lab="Doanh số hợp nhất" val={money(k.revenueKrw)} sub="▲ 18% vs kỳ trước" subCls="text-[#3f7d4e]" />
          <Kpi lab="Số đơn web" val={String(k.orders)} sub={`${k.packages} kiện`} />
          <Kpi lab="Kiện theo vùng" val={`${k.pkgKr}🇰🇷 · ${k.pkgVn}🇻🇳`} sub="tách 2 kho" />
          <Kpi lab="Đang vận chuyển" val={String(k.shipping)} sub="theo webhook" mirror />
          <Kpi lab="Cảnh báo tồn" val={String(k.lowStock)} sub="dưới ngưỡng" mirror alert />
          <Kpi lab="Lỗi đẩy Pancake" val={String(k.pushFailed)} sub="cần đẩy lại" alert />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* customers */}
          <div>
            <Panel title="Đơn theo khách" src="web-native">
              {customers.length === 0 ? (
                <div className="py-3.5 text-center opacity-60">Không có đơn khớp bộ lọc.</div>
              ) : (
                customers.map((c, ci) => (
                  <div key={ci} className="mb-2.5 overflow-hidden rounded border border-line">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [ci]: !o[ci] }))}
                      className="flex w-full items-center gap-2.5 bg-cream px-3.5 py-2.5 text-left hover:bg-[#f2e9d6]"
                    >
                      <span className={`text-gold transition-transform ${open[ci] ? "rotate-90" : ""}`}>▸</span>
                      <div>
                        <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">{c.name}</div>
                        <div className="text-[11px] opacity-60">
                          {c.phone} · {c.code} · {c.shipments.length} kiện
                        </div>
                      </div>
                      <div className="flex-1" />
                      <span className="rounded-sm border border-line px-2 py-0.5 text-[9.5px] uppercase">
                        {c.region === "kr" ? "Đặt ở Hàn" : "Đặt ở VN"}
                      </span>
                      <span className="font-serif font-semibold text-maroon-deep">{money(c.totalKrw)}</span>
                    </button>
                    {open[ci] && (
                      <div className="px-3.5 pb-3 pt-1">
                        {c.shipments.map((s, i) => (
                          <div key={i} className="mt-2 rounded border border-line border-l-[3px] border-l-gold bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-serif text-[12.5px] text-maroon">
                                Kiện {i + 1} · {s.to}
                              </span>
                              <span className="rounded-sm border border-line px-1.5 py-0.5 text-[9.5px] uppercase">{s.warehouse}</span>
                              <span className="flex-1" />
                              <span className={`rounded-full px-2.5 py-1 text-[10px] ${PILL_CLASS[s.pill]}`}>{s.status}</span>
                              {s.pill === "fail" && (
                                <button className="rounded bg-maroon px-2.5 py-1 text-[9.5px] uppercase tracking-wide text-cream">
                                  Đẩy lại
                                </button>
                              )}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] opacity-70">
                              <span>ĐVVC: <b>{s.carrier}</b></span>
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
                ))
              )}
            </Panel>
          </div>

          {/* right column */}
          <div>
            <Panel title="Doanh số theo ngày" src="web-native">
              <div className="flex h-32 items-end gap-1.5 pt-1.5">
                {data.daily.map((d) => (
                  <div key={d.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-gold to-maroon"
                      style={{ height: `${(d.v / maxDaily) * 100}%`, minHeight: 3 }}
                      title={money(d.v)}
                    />
                    <div className="text-[9px] opacity-60">{d.d}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Tồn kho" src="Pancake · mirror" mirror>
              {data.inventory.map((i, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between border-b border-dashed border-line py-2 text-[13px] last:border-0"
                >
                  <span>{i.name}</span>
                  <span>
                    <b className="font-serif text-maroon">{i.qty}</b>{" "}
                    <span
                      className={`ml-1 rounded-sm px-2 py-0.5 text-[11px] ${
                        i.status === "ok"
                          ? "bg-[#eef6ef] text-[#3f7d4e]"
                          : i.status === "low"
                            ? "bg-[#fff3e0] text-[#b8862f]"
                            : "bg-[#fbeaea] text-[#a33]"
                      }`}
                    >
                      {i.status === "ok" ? "Đủ" : i.status === "low" ? "Sắp hết" : "Hết"}
                    </span>
                  </span>
                </div>
              ))}
              <div className="mt-2.5 text-[10.5px] opacity-60">
                Nguồn chân lý = Pancake. Web chỉ hiển thị + cảnh báo dưới ngưỡng, không sửa.
              </div>
            </Panel>
          </div>
        </div>

        <div className="mt-4 text-center text-[10.5px] opacity-50">
          Nguồn dữ liệu web-native: {data.source === "supabase" ? "Supabase" : "seed (chưa cấu hình/chưa có đơn)"}
        </div>
      </div>
    </main>
  );
}

function Kpi({
  lab,
  val,
  sub,
  subCls,
  mirror,
  alert,
}: {
  lab: string;
  val: string;
  sub: string;
  subCls?: string;
  mirror?: boolean;
  alert?: boolean;
}) {
  return (
    <div className={`relative rounded border p-3.5 ${alert ? "border-gold bg-[#fffaf0]" : "border-line bg-white"}`}>
      <div className="text-[10.5px] uppercase tracking-wide text-[#8a7d68]">{lab}</div>
      <div className={`mt-1 font-serif text-2xl font-bold ${alert ? "text-[#b8862f]" : "text-maroon"}`}>{val}</div>
      <div className={`mt-0.5 text-[11px] ${subCls ?? "opacity-70"}`}>{sub}</div>
      {mirror && (
        <span className="absolute right-2.5 top-2.5 rounded-sm border border-line bg-cream px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-[#8a7d68]">
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
    <div className="mb-4 rounded border border-line bg-white p-4">
      <h3 className="mb-3 flex items-center justify-between font-serif text-[13px] uppercase tracking-wide text-maroon">
        {title}
        <span className={`rounded-sm px-1.5 py-0.5 font-body text-[8.5px] tracking-wide text-cream ${mirror ? "bg-[#2c5a8a]" : "bg-maroon"}`}>
          {src}
        </span>
      </h3>
      {children}
    </div>
  );
}
