"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RecentSale } from "@/lib/orders/recentActivity";
import { getBrowserClient } from "@/lib/supabase/browser";

// ============================================================================
// Hai mẩu "trang đang có người" trên trang bán hàng.
//
//   1. Chip  "N người đang xem"   — đếm THẬT qua presence của Supabase Realtime.
//   2. Toast "Vừa có người đặt …" — lấy từ ĐƠN THẬT, máy chủ đã lọc sạch thông
//      tin cá nhân trước khi truyền xuống (lib/orders/recentActivity.ts).
//
// Không có con số nào bịa. Không đủ dữ liệu thì ẨN HẲN, chứ không độn số cho
// đẹp: khách bắt gặp một lần là mất niềm tin vào mọi con số khác trên trang.
// ============================================================================

/**
 * Dưới ngưỡng này thì giấu chip đi.
 *
 * "1 người đang xem" chính là khách đang đọc — nói với người ta rằng họ có mặt
 * một mình thì phản tác dụng hơn hẳn việc không nói gì.
 */
const MIN_VIEWERS = 3;

const TOAST_SHOW_MS = 6_000;
const TOAST_GAP_MS = 25_000;
const FIRST_DELAY_MS = 8_000;

/** Khách tắt một lần là im tới hết phiên — tôn trọng ý người ta. */
const MUTED_KEY = "tr_activity_muted";

const FLAG: Record<string, string> = { vn: "🇻🇳", kr: "🇰🇷" };
const PLACE: Record<string, string> = { vn: "Việt Nam", kr: "Hàn Quốc" };

/** "18 phút trước". Tính ở TRÌNH DUYỆT — máy chủ dựng sẵn thì mở lúc nào cũng ra số cũ. */
function agoText(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export default function SalesActivity({ sales }: { sales: RecentSale[] }) {
  return (
    <>
      <ViewerChip />
      <SaleToast sales={sales} />
    </>
  );
}

// ------------------------------------------------------------------ chip
function ViewerChip() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Thư viện Supabase nạp động nên hàm này là async; trang có thể đã đóng
    // trước khi tải xong, `off` lo việc đó.
    let off: (() => void) | undefined;
    let dead = false;

    void (async () => {
      const sb = await getBrowserClient();
      if (!sb || dead) return;

      // Mỗi tab một khoá riêng, nếu không hai tab của cùng một người đè lên nhau
      // và đếm thành một.
      const me = Math.random().toString(36).slice(2);
      const channel = sb.channel("dk-san-pham", { config: { presence: { key: me } } });

      channel
        .on("presence", { event: "sync" }, () => {
          setCount(Object.keys(channel.presenceState()).length);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
        });

      off = () => void sb.removeChannel(channel);
      if (dead) off();
    })();

    return () => {
      dead = true;
      off?.();
    };
  }, []);

  if (count < MIN_VIEWERS) return null;

  return (
    <div className="px-4 pt-3">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10.5px] text-ink/65">
        <span className="relative grid h-1.5 w-1.5 place-items-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
        </span>
        <b className="font-semibold tabular-nums text-ink/85">{count}</b> người đang xem
      </span>
    </div>
  );
}

// ----------------------------------------------------------------- toast
function SaleToast({ sales }: { sales: RecentSale[] }) {
  const [idx, setIdx] = useState(-1); // -1 = đang ẩn
  const [muted, setMuted] = useState(true); // im cho tới khi biết chắc khách chưa tắt
  const turn = useRef(0);

  useEffect(() => {
    try {
      setMuted(sessionStorage.getItem(MUTED_KEY) === "1");
    } catch {
      setMuted(false); // trình duyệt chặn storage thì cứ chạy
    }
  }, []);

  useEffect(() => {
    if (muted || !sales.length) return;

    let show: ReturnType<typeof setTimeout>;
    let hide: ReturnType<typeof setTimeout>;

    const cycle = () => {
      setIdx(turn.current % sales.length);
      turn.current += 1;
      hide = setTimeout(() => setIdx(-1), TOAST_SHOW_MS);
      show = setTimeout(cycle, TOAST_SHOW_MS + TOAST_GAP_MS);
    };
    show = setTimeout(cycle, FIRST_DELAY_MS);

    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [muted, sales.length]);

  const sale = idx >= 0 ? sales[idx] : undefined;
  // Giờ trôi trong lúc khách mở trang, nên tính lại mỗi lần hiện.
  const ago = useMemo(() => (sale ? agoText(sale.atIso) : ""), [sale]);
  if (!sale) return null;

  const stop = () => {
    setIdx(-1);
    setMuted(true);
    try {
      sessionStorage.setItem(MUTED_KEY, "1");
    } catch {
      /* chặn storage thì thôi, ít nhất phiên này đã im */
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      // bottom-20: nằm trên thanh "Tới giỏ" cố định ở đáy, không che nút mua.
      className="fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-app px-4 motion-safe:animate-[fadeUp_.3s_ease-out]"
    >
      <div className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-white px-2.5 py-2 shadow-card">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-lg border border-line bg-cream-soft text-[13px]">
          {FLAG[sale.region] ?? "🥮"}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[10.5px] text-ink/80">
            Một khách ở <b className="font-semibold">{PLACE[sale.region] ?? "xa"}</b> vừa đặt{" "}
            <b className="font-semibold">{sale.product}</b>
          </span>
          <span className="block text-[9.5px] text-ink/45">{ago}</span>
        </span>
        <button
          onClick={stop}
          aria-label="Không hiện nữa"
          className="ml-auto grid h-5 w-5 flex-none place-items-center self-start rounded text-[12px] leading-none text-ink/35 hover:text-ink/70"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
