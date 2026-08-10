import { getBoxes, getFlavors } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { Box, Region } from "@/lib/types";

export const metadata = { title: "Trăng Rằm — Khách lẻ" };

const GOLD = "bg-gradient-to-b from-[#F7EBC0] via-[#E8C877] to-[#C6A24C] bg-clip-text text-transparent";

function BoxShowcase({ box, region }: { box: Box; region: Region }) {
  const specs = (box.specs ?? {}) as { material?: string; pieces?: string };
  const price = region === "vn" ? box.price_vn : box.price_kr;
  const bullets = [
    box.description ?? `${box.slots} bánh ${box.weight}g`,
    specs.pieces ?? `${box.slots} bánh nướng truyền thống`,
    specs.material ? `Hộp ${specs.material}` : "Hộp ép kim sang trọng",
    "Thiệp chúc mừng · giao toàn quốc",
  ];
  return (
    <article className="overflow-hidden rounded-2xl border border-[#C6A24C]/40 bg-[#0c1a31]/70">
      <div className="p-3.5">
        {/* ảnh khung vàng */}
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-[#C6A24C]/50 bg-gradient-to-br from-[#15294a] via-[#0f2038] to-[#081221]">
          <span className="text-[68px] drop-shadow-lg">🥮</span>
          <span className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded border border-[#C6A24C]/70 text-[10px] font-bold text-[#E8C877]">
            2026
          </span>
          {box.badge && (
            <span className="absolute left-2.5 top-2.5 rounded border border-[#C6A24C]/60 bg-[#0a1526]/70 px-2 py-0.5 text-[9px] font-bold text-[#E8C877]">
              {box.badge === "best_seller" ? "BÁN CHẠY NHẤT" : "NÊN THỬ"}
            </span>
          )}
        </div>

        <h3 className={`mt-3 text-[19px] font-extrabold uppercase leading-tight tracking-wide ${GOLD}`}>
          {box.name}
        </h3>

        <ul className="mt-2 space-y-1">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-cream/80">
              <span className="text-[#E8C877]">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-baseline gap-2 border-t border-[#C6A24C]/25 pt-3">
          <span className="text-[10px] uppercase tracking-wide text-cream/50">Giá bán</span>
          <span className={`text-[20px] font-extrabold ${GOLD}`}>{formatMoney(price, region)}</span>
          <span className="text-[11px] text-cream/50">/ hộp</span>
        </div>

        <a
          href={`/dat-hang?box=${box.id}&region=${region}&express=1`}
          className="mt-3 block rounded-lg bg-gradient-to-b from-[#E8C877] to-[#C6A24C] py-2.5 text-center text-[13px] font-bold text-[#14203A]"
        >
          Mua ngay
        </a>
      </div>
    </article>
  );
}

// Luồng KHÁCH LẺ — phong cách navy + gold. Giữ cả ₩ Hàn / đ VN.
export default async function KhachLePage({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const sp = await searchParams;
  const region: Region = sp.region === "vn" ? "vn" : "kr";
  const [boxes, flavors] = await Promise.all([getBoxes(), getFlavors()]);

  return (
    <main className="mx-auto min-h-screen max-w-app bg-[#0a1526] pb-24 text-cream">
      {/* hotline */}
      <div className="border-b border-[#C6A24C]/20 bg-[#081221] px-3 py-2 text-center text-[11px] tracking-wide text-cream/80">
        Giao toàn quốc VN &amp; Hàn Quốc · Hotline <b className="text-[#E8C877]">0982 576 263</b>
      </div>

      {/* header */}
      <header className="border-b border-[#C6A24C]/25 bg-[#0a1526] px-4 pb-3 pt-4 text-center">
        <div className={`text-[22px] font-extrabold uppercase tracking-[0.22em] ${GOLD}`}>Trăng Rằm</div>
        <div className="mt-1 text-[10.5px] italic tracking-wide text-cream/55">Bánh Trung Thu thủ công cao cấp</div>
        <nav className="mt-3 flex justify-center gap-6 text-[11px] uppercase tracking-widest text-[#E8C877]/85">
          <a href="/san-pham">Sản phẩm</a>
          <a href="/dat-hang">Đặt hàng</a>
          <a href="/tra-cuu">Tra cứu</a>
        </nav>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(130%_90%_at_50%_-5%,#274063_0%,#132444_42%,#0a1526_100%)] px-6 py-12 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(232,200,119,0.18),transparent_70%)]" />
        <div className="relative">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.28em] text-[#E8C877]/80">
            Trung Thu 2026 · Mùa đoàn viên
          </div>
          <h1 className={`my-4 text-[34px] font-extrabold uppercase leading-[1.05] tracking-wide ${GOLD}`}>
            Trọn vị<br />đoàn viên
          </h1>
          <p className="mx-auto mb-6 max-w-[290px] text-[13px] leading-relaxed text-cream/75">
            Bánh nướng · bánh dẻo thủ công, hộp quà ép kim sang trọng cho mùa Trung Thu.
          </p>
          <a
            href="/san-pham"
            className="inline-block rounded-full bg-gradient-to-b from-[#E8C877] to-[#C6A24C] px-7 py-3 text-[12px] font-bold uppercase tracking-wide text-[#14203A]"
          >
            Xem bộ sưu tập
          </a>
        </div>
      </section>

      {/* region switch */}
      <div className="flex gap-2 px-4 pb-1 pt-6 text-[11.5px]">
        <a
          href="/le?region=kr"
          className={`flex-1 rounded-lg border py-2 text-center font-semibold ${region === "kr" ? "border-[#C6A24C] bg-[#C6A24C]/12 text-[#E8C877]" : "border-[#C6A24C]/30 text-cream/60"}`}
        >
          🇰🇷 Giao ở Hàn · ₩
        </a>
        <a
          href="/le?region=vn"
          className={`flex-1 rounded-lg border py-2 text-center font-semibold ${region === "vn" ? "border-[#C6A24C] bg-[#C6A24C]/12 text-[#E8C877]" : "border-[#C6A24C]/30 text-cream/60"}`}
        >
          🇻🇳 Giao ở VN · đ
        </a>
      </div>

      {/* bộ sưu tập hộp */}
      <section className="px-4 py-6">
        <div className="mb-4 text-center">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-[#E8C877]/75">
            Bộ sưu tập hộp quà
          </div>
          <h2 className={`mt-1 text-[19px] font-extrabold uppercase tracking-wide ${GOLD}`}>Hộp quà cao cấp</h2>
        </div>
        <div className="grid gap-4">
          {boxes.map((b) => (
            <BoxShowcase key={b.id} box={b} region={region} />
          ))}
        </div>
        <a
          href="/san-pham"
          className="mt-4 block rounded-lg border border-[#C6A24C]/50 py-3 text-center text-[12px] font-semibold uppercase tracking-wide text-[#E8C877]"
        >
          Xem tất cả · combo · mua lẻ
        </a>
      </section>

      {/* lưu ý */}
      <div className="border-y border-[#C6A24C]/35 bg-[#081221] px-4 py-2.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-[#E8C877]/90">
        Lưu ý: giá đã gồm VAT, chưa gồm phí vận chuyển
      </div>

      {/* nguồn dữ liệu */}
      <div className="px-4 py-4 text-center text-[10px] text-cream/40">
        Nguồn: {isSupabaseConfigured ? "Supabase" : "seed demo"} · {boxes.length} hộp · {flavors.length} vị
      </div>

      {/* sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-app items-center gap-2 border-t border-[#C6A24C]/35 bg-[#0a1526]/95 px-3 py-2.5 backdrop-blur">
        <a href="/tra-cuu" className="rounded-lg border border-[#C6A24C]/45 px-3 py-2.5 text-[12px] font-semibold text-[#E8C877]">
          Tra đơn
        </a>
        <a
          href="/dat-hang"
          className="flex-1 rounded-lg bg-gradient-to-b from-[#E8C877] to-[#C6A24C] py-2.5 text-center text-[13px] font-bold text-[#14203A]"
        >
          Đặt bánh ngay
        </a>
      </div>
    </main>
  );
}
