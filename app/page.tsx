const GOLD = "bg-gradient-to-b from-[#F7EBC0] via-[#E8C877] to-[#C6A24C] bg-clip-text text-transparent";

// Cổng vào — điểm vào duy nhất để chọn luồng. Hai luồng cách ly, không link qua lại.
export default function Gateway() {
  const cards = [
    {
      href: "/le",
      emoji: "🥮",
      title: "Khách lẻ",
      sub: "Mua lẻ · hộp quà biếu",
      note: "Giao ₩ Hàn / đ VN · nhận trong ngày",
    },
    {
      href: "/doanh-nghiep",
      emoji: "🏢",
      title: "Doanh nghiệp",
      sub: "Đặt số lượng · quà biếu công ty",
      note: "VAT · chiết khấu · in logo",
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-app bg-[#0a1526] text-cream">
      {/* hotline */}
      <div className="border-b border-[#C6A24C]/20 bg-[#081221] px-3 py-2 text-center text-[11px] tracking-wide text-cream/80">
        Giao toàn quốc VN &amp; Hàn Quốc · Hotline <b className="text-[#E8C877]">0982 576 263</b>
      </div>

      {/* brand */}
      <section className="relative overflow-hidden bg-[radial-gradient(130%_80%_at_50%_-10%,#274063_0%,#132444_45%,#0a1526_100%)] px-6 pb-8 pt-12 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(232,200,119,0.18),transparent_70%)]" />
        <div className="relative">
          <div className={`text-[26px] font-extrabold uppercase tracking-[0.22em] ${GOLD}`}>Trăng Rằm</div>
          <div className="mt-1.5 text-[11px] italic tracking-wide text-cream/60">Bánh Trung Thu thủ công cao cấp</div>
          <p className="mx-auto mt-5 max-w-[260px] text-[12.5px] leading-relaxed text-cream/70">
            Anh là khách lẻ hay đặt cho doanh nghiệp? Chọn luồng phù hợp bên dưới.
          </p>
        </div>
      </section>

      {/* 2 lối vào */}
      <section className="flex flex-col gap-4 px-5 pb-10 pt-6">
        {cards.map((c) => (
          <a
            key={c.href}
            href={c.href}
            className="group flex items-center gap-4 rounded-2xl border border-[#C6A24C]/45 bg-white/[0.03] p-5 transition hover:border-[#C6A24C] hover:bg-white/[0.06]"
          >
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-[#C6A24C]/50 bg-gradient-to-br from-[#15294a] to-[#081221] text-[34px]">
              {c.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-[19px] font-extrabold uppercase tracking-wide ${GOLD}`}>{c.title}</div>
              <div className="mt-0.5 text-[12px] text-cream/80">{c.sub}</div>
              <div className="mt-1 text-[11px] text-cream/50">{c.note}</div>
            </div>
            <span className="text-[22px] text-[#E8C877] transition group-hover:translate-x-0.5">→</span>
          </a>
        ))}

        <a
          href="/tra-cuu"
          className="mt-1 text-center text-[12px] font-semibold uppercase tracking-wide text-[#E8C877]/80"
        >
          Tra cứu đơn đã đặt
        </a>
      </section>
    </main>
  );
}
