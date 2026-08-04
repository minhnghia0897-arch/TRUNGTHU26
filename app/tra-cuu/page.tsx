// Trang tra cứu theo SĐT (Phase 4 — bản khung; nối API + rate-limit sau).
export default function TraCuuPage() {
  return (
    <main className="px-4 py-6">
      <header className="mb-5 text-center">
        <div className="title-heritage text-base tracking-[0.18em]">Trăng Rằm</div>
        <div className="eyebrow mt-2">Tra cứu</div>
        <h1 className="title-heritage mt-1 text-xl">Theo dõi đơn</h1>
      </header>
      <div className="rounded border border-line bg-white p-4">
        <label className="mb-1.5 block font-serif text-[11px] font-semibold uppercase tracking-wide text-maroon">
          Số điện thoại đã đặt
        </label>
        <div className="flex gap-2">
          <input
            placeholder="Nhập SĐT"
            className="w-full rounded border border-line bg-white p-2.5 text-sm"
          />
          <button className="rounded bg-gold px-4 py-2.5 font-serif text-xs font-semibold uppercase tracking-wide text-maroon-deep">
            Tra
          </button>
        </div>
        <p className="mt-2 text-[11px] opacity-65">
          Không cần đăng nhập. Có giới hạn số lần tra để chống dò danh bạ.
        </p>
      </div>
      <p className="mt-4 text-center text-[11px] opacity-50">
        Bản khung — sẽ nối API tra cứu + timeline pipeline Pancake ở bước tích hợp.
      </p>
    </main>
  );
}
