"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Form() {
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Không đăng nhập được.");
        return;
      }
      // dùng location thay router.push để middleware chạy lại với cookie mới
      window.location.href = next;
    } catch {
      setError("Mất kết nối. Thử lại giúp em.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-blue-600 text-[13px] font-bold text-white">
            DK
          </span>
          <div>
            <div className="font-semibold text-slate-800">Doran King</div>
            <div className="text-[12px] text-slate-500">Bảng điều hành</div>
          </div>
        </div>

        <label className="mb-1.5 block text-[13px] font-medium text-slate-600" htmlFor="pw">
          Mật khẩu
        </label>
        <input
          id="pw"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-blue-500"
        />

        {error && (
          <p className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 w-full rounded-lg bg-blue-600 py-2.5 text-[14px] font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Đang kiểm tra…" : "Vào bảng điều hành"}
        </button>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Trang này chỉ dành cho người quản lý cửa hàng.
        </p>
      </form>
    </main>
  );
}

export default function LoginForm() {
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
