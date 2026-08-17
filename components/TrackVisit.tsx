"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// ============================================================================
// Báo cho máy chủ biết có người đang xem trang (§0023).
//
// Vì sao đếm ở TRÌNH DUYỆT chứ không đếm lúc máy chủ dựng trang: đếm ở máy chủ
// thì mọi con bot đi quét web đều được tính là khách, và anh chủ nhìn con số
// tưởng đông người xem. Bot hầu như không chạy JavaScript, nên đếm ở đây ra
// đúng người thật.
//
// Đặt trong layout gốc để không sót trang nào, rồi tự loại khu quản trị ra —
// mỗi lần anh bấm quanh dashboard mà cũng tính là một khách thì con số vô nghĩa.
// ============================================================================

/** Đường dẫn KHÔNG đếm: khu quản trị và trang đăng nhập. */
const SKIP = ["/dashboard", "/dang-nhap"];

export default function TrackVisit() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || SKIP.some((p) => pathname.startsWith(p))) return;
    // `keepalive` để lượt xem vẫn được gửi đi khi khách bấm sang trang khác ngay.
    // Lỗi thì nuốt: số liệu phụ không được phép làm phiền người đang mua hàng.
    void fetch("/api/track", { method: "POST", keepalive: true }).catch(() => {});
  }, [pathname]);

  return null;
}
