"use client";

import { useState } from "react";
import { findOrdersByPhone, type WebOrder } from "@/lib/webOrders";
import { formatMoney } from "@/lib/money";

export default function LookupFlow() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<WebOrder[] | null>(null);

  const search = () => {
    if (!phone.trim()) return;
    setResult(findOrdersByPhone(phone));
  };

  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream px-4 py-6 shadow-2xl">
      <div className="mb-2">
        <a href="/le" aria-label="Về trang chủ" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-maroon/70 transition hover:text-gold">
          <span className="text-base leading-none">←</span> Trang chủ
        </a>
      </div>
      <header className="mb-5 text-center">
        <a href="/le" className="title-heritage text-base tracking-[0.18em]">Trăng Rằm</a>
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
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Nhập SĐT"
            className="w-full rounded border border-line bg-white p-2.5 text-sm"
          />
          <button
            onClick={search}
            className="rounded bg-gold px-4 py-2.5 font-serif text-xs font-semibold uppercase tracking-wide text-maroon-deep"
          >
            Tra
          </button>
        </div>
        <p className="mt-2 text-[11px] opacity-65">
          Không cần đăng nhập. (Demo: đọc đơn đã đặt trên chính trình duyệt này.)
        </p>
      </div>

      {result !== null && (
        <div className="mt-4">
          {result.length === 0 ? (
            <div className="rounded border border-line bg-white p-4 text-center text-sm opacity-70">
              Không tìm thấy đơn cho số này. Kiểm tra lại SĐT đã dùng khi đặt.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="eyebrow">{result.length} đơn</div>
              {result.map((o) => (
                <div key={o.code} className="rounded border border-line border-l-[3px] border-l-gold bg-white p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">Mã {o.code}</div>
                    <span className="rounded-sm border border-gold bg-[#fff8ec] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#b8862f]">
                      {o.status}
                    </span>
                  </div>
                  {o.ref && (
                    <div className="mt-1 text-[11px] font-medium text-blue-600">
                      Nguồn: Messenger{o.refCustomer ? ` · ${o.refCustomer}` : ""}
                    </div>
                  )}
                  <div className="mt-1.5 text-xs opacity-70">
                    {o.items.join(" · ") || "—"}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2 text-[13px]">
                    <span className="opacity-70">Nội dung CK <b className="font-serif text-maroon">{o.transferCode}</b></span>
                    <b className="font-serif text-maroon-deep">{formatMoney(o.grandTotal, o.region)}</b>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-[11px] opacity-50">
        Bản demo lưu trên trình duyệt. Bản thật: tra theo Supabase + timeline pipeline Pancake.
      </p>
    </main>
  );
}
