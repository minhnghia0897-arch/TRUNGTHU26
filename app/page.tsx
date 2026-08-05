import { getBoxes, getFlavors } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { Badge, Region } from "@/lib/types";
import { IconLotus, IconCrown, IconStar, IconCheck, IconArrowRight } from "@/components/icons";

function CardBadge({ badge }: { badge?: Badge }) {
  if (!badge) return null;
  const isBest = badge === "best_seller";
  return (
    <div
      className={`absolute right-2.5 top-2.5 flex h-12 w-12 flex-col items-center justify-center rounded-full text-center text-[7px] font-bold uppercase leading-tight text-white shadow-md ${isBest ? "bg-gradient-to-br from-gold to-gold-deep" : "bg-navy"}`}
    >
      {isBest ? <IconCrown width={13} height={13} /> : <IconStar width={13} height={13} />}
      <span className="mt-0.5">{isBest ? "Best\nSeller" : "Must\nTry"}</span>
    </div>
  );
}

// Storefront — server component. Vùng hiển thị mặc định KR (thị trường chính §5).
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const sp = await searchParams;
  const region: Region = sp.region === "vn" ? "vn" : "kr";
  const [boxes, flavors] = await Promise.all([getBoxes(), getFlavors()]);

  const cheapestBox = boxes.reduce((a, b) =>
    (region === "vn" ? b.price_vn < a.price_vn : b.price_kr < a.price_kr) ? b : a,
  );

  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream pb-24 shadow-2xl">
      {/* hotline */}
      <div className="bg-maroon-deep px-3 py-2 text-center text-[11.5px] tracking-wide text-cream">
        Giao toàn quốc VN &amp; Hàn Quốc · Hotline <b className="text-gold">1900 6060</b>
      </div>

      {/* header */}
      <header className="border-b border-line bg-cream px-4 pb-3 pt-4 text-center">
        <div className="title-heritage text-xl tracking-[0.18em]">Trăng Rằm</div>
        <div className="mt-1 font-body text-[11px] italic opacity-70">
          Bánh Trung Thu thủ công
        </div>
        <nav className="mt-3 flex justify-center gap-5 text-[11px] uppercase tracking-widest text-maroon">
          <a href="/san-pham" className="opacity-80">Sản phẩm</a>
          <a href="/dat-hang" className="opacity-80">Đặt hàng</a>
          <a href="/tra-cuu" className="opacity-80">Tra cứu</a>
        </nav>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,#2a3d5f_0%,#1C2B45_45%,#14203A_100%)] px-6 py-11 text-center text-cream">
        <div className="eyebrow">Trung Thu · Mùa đoàn viên</div>
        <h1 className="my-4 font-serif text-[32px] font-bold uppercase leading-tight tracking-[0.04em]">
          Trọn vị đoàn viên
        </h1>
        <p className="mx-auto mb-5 max-w-[300px] text-sm opacity-90">
          Bánh nướng · bánh dẻo thủ công, hộp quà biếu tinh tế cho mùa Trung Thu.
        </p>
        <a
          href="/san-pham"
          className="inline-flex items-center gap-1.5 rounded-full bg-gold px-6 py-3 text-xs font-semibold uppercase tracking-wide text-navy-deep"
        >
          Đặt ngay <IconArrowRight width={14} height={14} />
        </a>
      </section>

      {/* region switch */}
      <div className="flex justify-center gap-2 bg-cream px-4 py-3 text-[11px]">
        <a
          href="/?region=kr"
          className={`rounded-full border px-4 py-2 font-semibold uppercase tracking-wide ${region === "kr" ? "border-navy bg-navy text-cream" : "border-line bg-white text-navy"}`}
        >
          🇰🇷 Đặt ở Hàn · ₩
        </a>
        <a
          href="/?region=vn"
          className={`rounded-full border px-4 py-2 font-semibold uppercase tracking-wide ${region === "vn" ? "border-navy bg-navy text-cream" : "border-line bg-white text-navy"}`}
        >
          🇻🇳 Đặt ở VN · đ
        </a>
      </div>

      {/* sản phẩm */}
      <section id="ban" className="px-5 py-8">
        <div className="mb-5 text-center">
          <div className="eyebrow">Ba cách chọn quà</div>
          <h2 className="title-heritage mt-1 text-xl">Bộ sưu tập</h2>
        </div>
        <div className="grid gap-4">
          {boxes.map((b) => (
            <article key={b.id} className="overflow-hidden rounded-card bg-white shadow-card">
              <div className="relative flex h-40 items-center justify-center bg-cream-soft">
                <IconLotus width={54} height={54} className="text-gold/45" />
                <CardBadge badge={b.badge} />
                <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded bg-gold/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <IconCheck width={11} height={11} /> {b.weight}GR
                </div>
              </div>
              <div className="p-4 text-center">
                <h3 className="font-semibold text-navy">{b.name}</h3>
                <p className="mx-auto mt-1 max-w-[280px] text-xs text-ink/60">
                  {b.description ?? `${b.slots} ô · bánh ${b.weight}g`}
                </p>
                <div className="mx-auto my-3 h-px w-16 bg-line" />
                <span className="price-lg text-lg">
                  {formatMoney(region === "vn" ? b.price_vn : b.price_kr, region)} <span className="unit">/ hộp</span>
                </span>
                <a
                  href={`/dat-hang?box=${b.id}&region=${region}`}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-gold py-2.5 text-xs font-semibold uppercase tracking-wide text-navy-deep"
                >
                  Tự chọn vị <IconArrowRight width={14} height={14} />
                </a>
              </div>
            </article>
          ))}
        </div>
        <a
          href="/san-pham"
          className="mt-4 flex items-center justify-center gap-1.5 rounded-full border border-navy py-3 text-center text-xs font-semibold uppercase tracking-wide text-navy"
        >
          Xem chi tiết · Combo · Mua lẻ <IconArrowRight width={14} height={14} />
        </a>
      </section>

      {/* editorial */}
      <div className="bg-navy px-6 py-11 text-center text-cream">
        <div className="mx-auto mb-4 flex items-center justify-center gap-2 text-gold">
          <span className="h-px w-8 bg-gold/50" />
          <IconLotus width={18} height={18} />
          <span className="h-px w-8 bg-gold/50" />
        </div>
        <h2 className="text-[21px] font-semibold italic leading-snug">
          “Mỗi chiếc bánh là một lời chúc gửi người thương.”
        </h2>
        <p className="mx-auto mt-3.5 max-w-[320px] text-sm opacity-85">
          Công thức truyền thống, nhân sên tay trong ngày, không chất bảo quản công nghiệp.
        </p>
      </div>

      {/* trạng thái nguồn dữ liệu (dev) */}
      <div className="px-5 py-4 text-center text-[10.5px] opacity-50">
        Nguồn dữ liệu: {isSupabaseConfigured ? "Supabase" : "seed fallback (chưa cấu hình Supabase)"} ·{" "}
        {flavors.length} vị · giá rẻ nhất {formatMoney(region === "vn" ? cheapestBox.price_vn : cheapestBox.price_kr, region)}
      </div>

      {/* sticky cta */}
      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-app items-center gap-2.5 border-t border-line bg-cream px-4 py-3">
        <span className="flex-1 text-[11px] uppercase tracking-wide text-maroon opacity-70">
          Chọn hộp & vị anh thích
        </span>
        <a
          href="/san-pham"
          className="rounded-full bg-gold px-5 py-3 text-xs font-semibold uppercase tracking-wide text-navy-deep"
        >
          Đặt bánh
        </a>
      </div>
    </main>
  );
}
