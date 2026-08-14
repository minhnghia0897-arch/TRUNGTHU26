"use client";

import type { UseOrders } from "@/components/useOrders";

/**
 * Dải thông báo trạng thái nguồn đơn, dùng chung cho các trang dashboard.
 *
 * Quan trọng: khi đã nối cơ sở dữ liệu mà đọc lỗi thì phải báo lỗi thật rõ.
 * Nếu lặng lẽ hiện đơn mẫu, anh sẽ tưởng hôm nay không có khách nào đặt.
 */
export default function OrdersStateBanner({ store }: { store: UseOrders }) {
  if (store.needLogin)
    return (
      <Bar tone="warn">
        Phiên đăng nhập đã hết hạn.{" "}
        <a href="/dang-nhap" className="font-medium underline">
          Đăng nhập lại
        </a>
      </Bar>
    );

  if (store.error)
    return (
      <Bar tone="error">
        {store.error}{" "}
        <button onClick={store.refresh} className="font-medium underline">
          Thử lại
        </button>
      </Bar>
    );

  if (store.loading) return <Bar tone="info">Đang tải đơn hàng…</Bar>;

  if (store.source === "seed")
    return (
      <Bar tone="info">
        Chế độ xem thử — chưa nối cơ sở dữ liệu, đây là đơn mẫu. Đơn khách đặt thật sẽ không
        hiện ở đây cho tới khi cấu hình xong (xem <code>docs/supabase.md</code>).
      </Bar>
    );

  return null;
}

function Bar({ tone, children }: { tone: "info" | "warn" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-500";
  return <div className={`border-b px-5 py-2 text-[12px] ${cls}`}>{children}</div>;
}
