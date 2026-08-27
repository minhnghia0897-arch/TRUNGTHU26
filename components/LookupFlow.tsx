"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import { STATUS_COLOR } from "@/lib/ordersMock";
import { buildXlsx, downloadBlob, type SheetSpec } from "@/lib/xlsx";
import type { Currency, Region } from "@/lib/types";

// ============================================================================
// Tra cứu & quản đơn theo SĐT NGƯỜI ĐẶT — không cần đăng nhập.
//
// Hai kiểu người dùng, một trang:
// - Khách lẻ (1 đơn): xem thẻ như cũ.
// - KOL/đại lý đặt hộ nhiều khách: bấm sang DẠNG BẢNG — mỗi kiện một dòng như
//   bảng đơn ở Dashboard, sửa thẳng trên dòng (tên/SĐT/địa chỉ/hẹn giao/ghi
//   chú) và XUẤT EXCEL để đối soát. Kiện shop đã cho đi giao thì khoá 🔒 —
//   máy chủ cũng chặn, giao diện chỉ là lớp vỏ.
// ============================================================================

interface Row {
  shipmentId: string;
  orderCode: string;
  display: string;
  createdAtIso: string;
  paymentStatus: string;
  currency: Currency;
  status: string;
  editable: boolean;
  name: string;
  phone: string;
  address: string;
  region: Region;
  desiredDate: string;
  items: string;
  carrier: string;
  vc: string;
  note: string;
  amount: number;
}

interface Draft {
  name: string;
  phone: string;
  address: string;
  desiredDate: string;
  note: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Chờ thanh toán",
  paid: "Đã thanh toán",
  canceled: "Đã huỷ",
  refunded: "Đã hoàn tiền",
};

const day = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const regionOf = (c: Currency): Region => (c === "vnd" ? "vn" : "kr");

export default function LookupFlow() {
  const [phone, setPhone] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);
  const [view, setView] = useState<"the" | "bang">("the");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const search = async () => {
    if (!phone.trim() || loading) return;
    setLoading(true);
    setError("");
    setRows(null);
    setEditingId(null);
    try {
      const res = await fetch("/api/lookup/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        configured?: boolean;
        rows?: Row[];
      };
      if (!data.ok) {
        setError(data.error ?? "Không tra cứu được, thử lại giúp em.");
        return;
      }
      setDemo(data.configured === false);
      const rs = data.rows ?? [];
      setRows(rs);
      // Đặt hộ nhiều đơn thì mở thẳng dạng bảng — đó là người cần Excel.
      setView(new Set(rs.map((r) => r.orderCode)).size > 1 ? "bang" : "the");
    } catch {
      setError("Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (r: Row) => {
    setEditingId(r.shipmentId);
    setRowError("");
    setDraft({ name: r.name, phone: r.phone, address: r.address, desiredDate: r.desiredDate, note: r.note });
    setView("bang");
  };

  const saveEdit = async () => {
    if (!draft || !editingId || saving) return;
    setSaving(true);
    setRowError("");
    try {
      const res = await fetch("/api/lookup/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), shipmentId: editingId, edit: draft }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; locked?: boolean };
      if (!data.ok) {
        setRowError(data.error ?? "Không sửa được, thử lại giúp em.");
        // máy chủ báo khoá thì cập nhật lại dòng cho khớp sự thật
        if (data.locked)
          setRows((rs) => (rs ?? []).map((r) => (r.shipmentId === editingId ? { ...r, editable: false } : r)));
        return;
      }
      setRows((rs) =>
        (rs ?? []).map((r) => (r.shipmentId === editingId ? { ...r, ...draft } : r)),
      );
      setSavedId(editingId);
      setTimeout(() => setSavedId(null), 2500);
      setEditingId(null);
      setDraft(null);
    } catch {
      setRowError("Mất kết nối tới máy chủ. Thử lại giúp em.");
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    if (!rows?.length) return null;
    const orders = new Set(rows.map((r) => r.orderCode)).size;
    const byCur = new Map<Currency, number>();
    rows.forEach((r) => byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + r.amount));
    return { orders, parcels: rows.length, byCur };
  }, [rows]);

  const exportExcel = () => {
    if (!rows?.length) return;
    const sheet: SheetSpec = {
      name: "Đơn hàng",
      columns: [
        { header: "Mã kiện", width: 10 },
        { header: "Ngày đặt", width: 11 },
        { header: "Trạng thái", width: 14 },
        { header: "Thanh toán", width: 13 },
        { header: "Người nhận", width: 18 },
        { header: "SĐT nhận", width: 14 },
        { header: "Địa chỉ", width: 36 },
        { header: "Kho", width: 8 },
        { header: "Sản phẩm", width: 28 },
        { header: "Hẹn giao", width: 11 },
        { header: "ĐVVC", width: 8 },
        { header: "Vận đơn", width: 13 },
        { header: "Tiền kiện", width: 12, money: true },
        { header: "Tiền tệ", width: 8 },
        { header: "Ghi chú", width: 24 },
      ],
      rows: rows.map((r) => [
        r.display,
        day(r.createdAtIso),
        r.status,
        PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus,
        r.name,
        r.phone,
        r.address,
        r.region === "kr" ? "Kho Hàn" : "Kho VN",
        r.items,
        r.desiredDate ? day(r.desiredDate) : "",
        r.carrier,
        r.vc,
        r.amount,
        r.currency === "krw" ? "KRW" : "VND",
        r.note,
      ]),
    };
    const dt = new Date();
    const p = (x: number) => String(x).padStart(2, "0");
    downloadBlob(
      buildXlsx([sheet]),
      `don-hang-${phone.replace(/\D/g, "")}-${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}.xlsx`,
    );
  };

  const orderGroups = useMemo(() => {
    const m = new Map<string, Row[]>();
    (rows ?? []).forEach((r) => m.set(r.orderCode, [...(m.get(r.orderCode) ?? []), r]));
    return [...m.entries()];
  }, [rows]);

  const cell = "border-b border-line/70 px-2.5 py-2 align-top text-[12px] leading-snug";
  const inputCls = "w-full rounded border border-gold/60 bg-white px-1.5 py-1 text-[12px] outline-none focus:border-gold";

  return (
    // Dạng bảng nới khung ra như màn Dashboard — bảng nhiều cột mà nhét vào
    // khung điện thoại thì thành cuộn ngang bất tận, không còn "như Excel" nữa.
    <main
      className={`mx-auto min-h-screen bg-cream px-4 py-6 shadow-2xl ${
        view === "bang" && rows?.length ? "max-w-[1100px]" : "max-w-app"
      }`}
    >
      <div className="mb-2">
        <a
          href="/san-pham"
          aria-label="Về trang chủ"
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-maroon/70 transition hover:text-gold"
        >
          <span className="text-base leading-none">←</span> Trang chủ
        </a>
      </div>
      <header className="mb-5 text-center">
        <a href="/san-pham" className="title-heritage text-base tracking-[0.18em]">
          Doran King
        </a>
        <div className="eyebrow mt-2">Tra cứu</div>
        <h1 className="title-heritage mt-1 text-xl">Theo dõi đơn</h1>
      </header>

      <div className="rounded border border-line bg-white p-4">
        <label className="mb-1.5 block font-serif text-[11px] font-semibold uppercase tracking-wide text-maroon">
          Số điện thoại đã đặt
        </label>
        <div className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder="Nhập SĐT"
            inputMode="tel"
            className="w-full rounded border border-line bg-white p-2.5 text-sm"
          />
          <button
            onClick={() => void search()}
            disabled={loading}
            className="rounded bg-gold px-4 py-2.5 font-serif text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
          >
            {loading ? "Đang tra…" : "Tra"}
          </button>
        </div>
        <p className="mt-2 text-[11px] opacity-65">
          Không cần đăng nhập. Nhập đúng số đã dùng khi đặt hàng — đặt hộ nhiều khách (đại lý/KOL)
          cũng tra một lần ra hết đơn.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      {demo && rows !== null && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          Chế độ xem thử — đơn dưới đây là dữ liệu mẫu, chưa nối cơ sở dữ liệu.
        </div>
      )}

      {rows !== null && !error && (
        <div className="mt-4">
          {rows.length === 0 ? (
            <div className="rounded border border-line bg-white p-4 text-center text-sm opacity-70">
              Không tìm thấy đơn cho số này. Kiểm tra lại SĐT đã dùng khi đặt, hoặc nhắn cho shop
              để được hỗ trợ.
            </div>
          ) : (
            <>
              {/* thanh tổng quan + công cụ — cho người đặt nhiều đơn */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="eyebrow">
                  {summary?.orders} đơn · {summary?.parcels} kiện
                </span>
                {[...(summary?.byCur ?? [])].map(([cur, v]) => (
                  <span key={cur} className="rounded-sm bg-navy px-2 py-0.5 text-[11px] font-semibold text-white">
                    Tổng {formatMoney(v, regionOf(cur))}
                  </span>
                ))}
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="flex overflow-hidden rounded border border-line bg-white text-[11px] font-semibold">
                    {(["the", "bang"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`px-2.5 py-1.5 ${view === v ? "bg-navy text-white" : "text-navy"}`}
                      >
                        {v === "the" ? "Thẻ" : "Bảng"}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={exportExcel}
                    className="rounded border border-gold bg-gold/10 px-2.5 py-1.5 text-[11px] font-semibold text-gold-deep"
                  >
                    ⬇ Xuất Excel
                  </button>
                </div>
              </div>

              {rowError && (
                <div className="mb-2 rounded border border-rose-200 bg-rose-50 p-2.5 text-[12px] text-rose-700">
                  {rowError}
                </div>
              )}

              {view === "bang" ? (
                /* ---- DẠNG BẢNG: mỗi kiện một dòng, sửa thẳng trên dòng ---- */
                <div className="overflow-x-auto rounded border border-line bg-white">
                  <table className="w-full min-w-[980px] border-collapse text-left">
                    <thead>
                      <tr className="bg-cream-soft text-[10px] uppercase tracking-wide text-ink/60">
                        {["Mã", "Ngày đặt", "Trạng thái", "Người nhận", "SĐT nhận", "Địa chỉ", "Kho", "Sản phẩm", "Hẹn giao", "Vận đơn", "Tiền kiện", "Ghi chú", ""].map((h, i) => (
                          <th key={i} className="whitespace-nowrap border-b border-line px-2.5 py-2 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const editing = editingId === r.shipmentId;
                        return (
                          <tr key={r.shipmentId} className={editing ? "bg-gold/5" : "hover:bg-cream-soft/60"}>
                            <td className={`${cell} whitespace-nowrap font-serif font-semibold text-maroon`}>
                              {r.display}
                              <div className="mt-0.5 text-[10px] font-normal not-italic opacity-55">
                                {PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus}
                              </div>
                            </td>
                            <td className={`${cell} whitespace-nowrap`}>{day(r.createdAtIso)}</td>
                            <td className={`${cell} whitespace-nowrap`}>
                              <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[r.status] ?? "bg-slate-200 text-slate-700"}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className={`${cell} min-w-[120px]`}>
                              {editing ? (
                                <input className={inputCls} value={draft?.name ?? ""} onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })} />
                              ) : (
                                r.name
                              )}
                            </td>
                            <td className={`${cell} min-w-[110px] whitespace-nowrap`}>
                              {editing ? (
                                <input className={inputCls} value={draft?.phone ?? ""} onChange={(e) => setDraft((d) => d && { ...d, phone: e.target.value })} />
                              ) : (
                                r.phone
                              )}
                            </td>
                            <td className={`${cell} min-w-[200px]`}>
                              {editing ? (
                                <textarea rows={2} className={inputCls} value={draft?.address ?? ""} onChange={(e) => setDraft((d) => d && { ...d, address: e.target.value })} />
                              ) : (
                                r.address
                              )}
                            </td>
                            <td className={`${cell} whitespace-nowrap`}>{r.region === "kr" ? "Hàn" : "VN"}</td>
                            <td className={`${cell} min-w-[150px]`}>{r.items}</td>
                            <td className={`${cell} whitespace-nowrap`}>
                              {editing ? (
                                <input type="date" className={inputCls} value={draft?.desiredDate ?? ""} onChange={(e) => setDraft((d) => d && { ...d, desiredDate: e.target.value })} />
                              ) : (
                                r.desiredDate ? day(r.desiredDate) : "—"
                              )}
                            </td>
                            <td className={`${cell} whitespace-nowrap`}>{r.vc || "—"}</td>
                            <td className={`${cell} whitespace-nowrap font-semibold`}>
                              {formatMoney(r.amount, regionOf(r.currency))}
                            </td>
                            <td className={`${cell} min-w-[130px]`}>
                              {editing ? (
                                <textarea rows={2} className={inputCls} value={draft?.note ?? ""} onChange={(e) => setDraft((d) => d && { ...d, note: e.target.value })} />
                              ) : (
                                r.note || "—"
                              )}
                            </td>
                            <td className={`${cell} whitespace-nowrap text-right`}>
                              {editing ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => void saveEdit()}
                                    disabled={saving}
                                    className="rounded bg-gold px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                                  >
                                    {saving ? "…" : "Lưu"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingId(null);
                                      setDraft(null);
                                      setRowError("");
                                    }}
                                    className="rounded border border-line px-2 py-1 text-[11px]"
                                  >
                                    Huỷ
                                  </button>
                                </div>
                              ) : r.editable ? (
                                <button
                                  onClick={() => startEdit(r)}
                                  className="rounded border border-gold px-2 py-1 text-[11px] font-semibold text-gold-deep"
                                >
                                  {savedId === r.shipmentId ? "Đã lưu ✓" : "Sửa"}
                                </button>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] opacity-60"
                                  title="Kiện đã cho đi giao — muốn đổi thông tin nhắn shop giúp em"
                                >
                                  🔒 Đang giao
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="border-t border-line bg-cream-soft/60 px-3 py-2 text-[11px] opacity-70">
                    Sửa được tên · SĐT · địa chỉ · hẹn giao · ghi chú khi đơn chưa giao. Từ lúc shop
                    cho đi giao (🔒) muốn đổi gì nhắn shop. Đổi món/số lượng cũng nhắn shop.
                  </div>
                </div>
              ) : (
                /* ---- DẠNG THẺ: khách lẻ xem cho dễ ---- */
                <div className="space-y-3">
                  {orderGroups.map(([code, parcels]) => (
                    <div key={code} className="rounded border border-line border-l-[3px] border-l-gold bg-white p-3.5">
                      <div className="flex items-center justify-between">
                        <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">Mã {code}</div>
                        <span className="rounded-sm border border-gold bg-gold/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-gold-deep">
                          {PAYMENT_LABEL[parcels[0].paymentStatus] ?? parcels[0].paymentStatus}
                        </span>
                      </div>
                      {parcels[0].createdAtIso && (
                        <div className="mt-0.5 text-[11px] opacity-55">Đặt ngày {day(parcels[0].createdAtIso)}</div>
                      )}
                      <div className="mt-2 space-y-2">
                        {parcels.map((p, i) => (
                          <div key={p.shipmentId} className="rounded bg-cream-soft p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-medium">
                                {parcels.length > 1 ? `Kiện ${i + 1}: ` : ""}
                                {p.name || "Người nhận"}
                                <span className="ml-1 opacity-60">· {p.region === "kr" ? "Kho Hàn" : "Kho VN"}</span>
                              </span>
                              <span className={`whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[p.status] ?? "bg-navy text-white"}`}>
                                {p.status}
                              </span>
                            </div>
                            {p.items && <div className="mt-1 text-[11px] opacity-70">{p.items}</div>}
                            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] opacity-60">
                              {p.desiredDate && <span>Hẹn giao {day(p.desiredDate)}</span>}
                              {p.carrier && <span>{p.carrier}</span>}
                              {p.vc && <span>Vận đơn {p.vc}</span>}
                            </div>
                            <div className="mt-1.5">
                              {p.editable ? (
                                <button
                                  onClick={() => startEdit(p)}
                                  className="text-[11px] font-semibold text-gold-deep underline-offset-2 hover:underline"
                                >
                                  Sửa thông tin nhận →
                                </button>
                              ) : (
                                <span className="text-[11px] opacity-55">🔒 Đang giao — muốn đổi nhắn shop</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2 text-[13px]">
                        <span className="opacity-70">
                          Nội dung CK <b className="font-serif text-maroon">{code}</b>
                        </span>
                        <b className="font-serif text-navy">
                          {formatMoney(
                            parcels.reduce((s, p) => s + p.amount, 0),
                            regionOf(parcels[0].currency),
                          )}
                        </b>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
