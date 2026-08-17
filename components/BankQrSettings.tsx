"use client";

import { useRef, useState } from "react";
import { shrinkImage } from "@/lib/products/imageResize";

// ============================================================================
// Tải ảnh mã QR ngân hàng VN, hiện ở trang thanh toán.
//
// Không có ảnh thì trang tự dựng QR từ VietQR — QR đó CÓ SẴN SỐ TIỀN nên khách
// quét là khỏi gõ. Ảnh chính chủ xuất từ app ngân hàng thì quen mắt hơn nhưng
// KHÔNG mang số tiền. Nói thẳng cả hai mặt để anh chủ chọn có cơ sở, chứ không
// để tải lên rồi mới phát hiện khách phải tự gõ tiền.
// ============================================================================

export default function BankQrSettings({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (next: string) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/dashboard/bank-qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: next }),
      });
      const text = await res.text();
      let data: { ok?: boolean; error?: string };
      try {
        data = JSON.parse(text) as { ok?: boolean; error?: string };
      } catch {
        throw new Error(`Máy chủ trả lỗi ${res.status}.`);
      }
      if (!data.ok) throw new Error(data.error ?? "Không lưu được mã QR.");
      setUrl(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được mã QR.");
    } finally {
      setBusy(false);
    }
  };

  const pick = async (files: FileList | null) => {
    const raw = files?.[0];
    if (!raw) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const form = new FormData();
      form.append("file", await shrinkImage(raw));
      const res = await fetch("/api/dashboard/upload", { method: "POST", body: form });
      const text = await res.text();
      let data: { ok?: boolean; urls?: string[]; error?: string };
      try {
        data = JSON.parse(text) as { ok?: boolean; urls?: string[]; error?: string };
      } catch {
        // 413 trả chữ thường, không phải JSON — xem components/ProductsAdmin.tsx
        throw new Error(
          res.status === 413
            ? "Ảnh quá nặng so với giới hạn máy chủ."
            : `Máy chủ trả lỗi ${res.status}.`,
        );
      }
      if (!data.ok || !data.urls?.[0]) throw new Error(data.error ?? "Không tải được ảnh lên.");
      await save(data.urls[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được ảnh lên.");
      setBusy(false);
    }
  };

  return (
    <section className="px-5 pb-2">
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[14px] font-semibold text-slate-800">Mã QR ngân hàng VN</h3>
        {saved && <span className="text-[12px] text-emerald-600">Đã lưu</span>}
      </div>
      <p className="mt-1 text-[12.5px] text-slate-500">
        Ảnh QR chính chủ xuất từ app ngân hàng. Chưa tải thì trang thanh toán tự dựng mã QR
        VietQR — <b className="font-medium text-slate-700">mã tự dựng có sẵn số tiền</b>, còn
        ảnh tải lên thì khách phải tự gõ số tiền.
      </p>

      <div className="mt-3 flex items-start gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Mã QR ngân hàng"
            className="h-28 w-28 flex-none rounded-lg border border-slate-200 bg-white object-contain"
          />
        ) : (
          <div className="grid h-28 w-28 flex-none place-items-center rounded-lg border border-dashed border-slate-300 text-[11.5px] text-slate-400">
            Chưa có ảnh
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Đang tải…" : url ? "Đổi ảnh khác" : "Tải ảnh QR lên"}
          </button>
          {url && (
            <button
              onClick={() => void save("")}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              Gỡ ảnh, dùng QR tự dựng
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
    </section>
  );
}
