"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { Currency, Region } from "@/lib/types";

// ============================================================================
// Tra cứu đơn theo SĐT. Trước đây đọc localStorage nên khách đổi máy là mất
// đơn; giờ hỏi thẳng máy chủ, đặt ở đâu tra ở đâu cũng ra.
// ============================================================================

interface Parcel {
  recipient: string;
  region: Region;
  status: string;
  carrier: string;
  vc: string;
  desiredDate: string;
  items: string;
}
interface Order {
  code: string;
  transferCode: string;
  currency: Currency;
  grandTotal: number;
  paymentStatus: string;
  createdAtIso: string;
  parcels: Parcel[];
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

export default function LookupFlow() {
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);

  const search = async () => {
    if (!phone.trim() || loading) return;
    setLoading(true);
    setError("");
    setOrders(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        configured?: boolean;
        orders?: Order[];
      };
      if (!data.ok) {
        setError(data.error ?? "Không tra cứu được, thử lại giúp em.");
        return;
      }
      setDemo(data.configured === false);
      setOrders(data.orders ?? []);
    } catch {
      setError("Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream px-4 py-6 shadow-2xl">
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
            className="rounded bg-gold px-4 py-2.5 font-serif text-xs font-semibold uppercase tracking-wide text-maroon-deep disabled:opacity-60"
          >
            {loading ? "Đang tra…" : "Tra"}
          </button>
        </div>
        <p className="mt-2 text-[11px] opacity-65">
          Không cần đăng nhập. Nhập đúng số đã dùng khi đặt hàng.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      {demo && orders !== null && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          Trang đang ở chế độ xem thử, chưa nối cơ sở dữ liệu nên chưa tra được đơn thật.
        </div>
      )}

      {orders !== null && !error && !demo && (
        <div className="mt-4">
          {orders.length === 0 ? (
            <div className="rounded border border-line bg-white p-4 text-center text-sm opacity-70">
              Không tìm thấy đơn cho số này. Kiểm tra lại SĐT đã dùng khi đặt, hoặc nhắn cho shop
              để được hỗ trợ.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="eyebrow">{orders.length} đơn</div>
              {orders.map((o) => (
                <div
                  key={o.code}
                  className="rounded border border-line border-l-[3px] border-l-gold bg-white p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">
                      Mã {o.code}
                    </div>
                    <span className="rounded-sm border border-gold bg-[#fff8ec] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#b8862f]">
                      {PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus}
                    </span>
                  </div>
                  {o.createdAtIso && (
                    <div className="mt-0.5 text-[11px] opacity-55">Đặt ngày {day(o.createdAtIso)}</div>
                  )}

                  <div className="mt-2 space-y-2">
                    {o.parcels.map((p, i) => (
                      <div key={i} className="rounded bg-cream-soft p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium">
                            {o.parcels.length > 1 ? `Kiện ${i + 1}: ` : ""}
                            {p.recipient || "Người nhận"}
                            <span className="ml-1 opacity-60">
                              · {p.region === "kr" ? "Kho Hàn" : "Kho VN"}
                            </span>
                          </span>
                          <span className="whitespace-nowrap rounded-sm bg-navy px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {p.status}
                          </span>
                        </div>
                        {p.items && <div className="mt-1 text-[11px] opacity-70">{p.items}</div>}
                        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] opacity-60">
                          {p.desiredDate && <span>Hẹn giao {day(p.desiredDate)}</span>}
                          {p.carrier && <span>{p.carrier}</span>}
                          {p.vc && <span>Vận đơn {p.vc}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2 text-[13px]">
                    <span className="opacity-70">
                      Nội dung CK <b className="font-serif text-maroon">{o.transferCode}</b>
                    </span>
                    <b className="font-serif text-maroon-deep">
                      {formatMoney(o.grandTotal, o.currency === "vnd" ? "vn" : "kr")}
                    </b>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
