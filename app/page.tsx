import { getBoxes, getFlavors } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { Region } from "@/lib/types";

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
    <main className="pb-24">
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
          <a href="#ban" className="opacity-80">Sản phẩm</a>
          <a href="/dat-hang" className="opacity-80">Đặt hàng</a>
          <a href="/tra-cuu" className="opacity-80">Tra cứu</a>
        </nav>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,#6d1c28_0%,#5A1620_45%,#3B0E15_100%)] px-6 py-11 text-center text-cream">
        <div className="eyebrow">Trung Thu · Mùa đoàn viên</div>
        <h1 className="my-4 font-serif text-[32px] font-bold uppercase leading-tight tracking-[0.04em]">
          Trọn vị đoàn viên
        </h1>
        <p className="mx-auto mb-5 max-w-[300px] text-sm opacity-90">
          Bánh nướng · bánh dẻo thủ công, hộp quà biếu tinh tế cho mùa Trung Thu.
        </p>
        <a
          href="/dat-hang"
          className="inline-block rounded bg-gold px-6 py-3 font-serif text-xs font-semibold uppercase tracking-widest text-maroon-deep"
        >
          Đặt ngay
        </a>
      </section>

      {/* region switch */}
      <div className="flex justify-center gap-2 bg-cream px-4 py-3 text-[11px]">
        <a
          href="/?region=kr"
          className={`rounded border px-3 py-2 font-serif uppercase tracking-wide ${region === "kr" ? "border-maroon bg-maroon text-cream" : "border-line bg-white text-maroon"}`}
        >
          🇰🇷 Đặt ở Hàn · ₩
        </a>
        <a
          href="/?region=vn"
          className={`rounded border px-3 py-2 font-serif uppercase tracking-wide ${region === "vn" ? "border-maroon bg-maroon text-cream" : "border-line bg-white text-maroon"}`}
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
            <div key={b.id} className="overflow-hidden rounded border border-line bg-white">
              <div className="flex h-32 items-center justify-center bg-[linear-gradient(135deg,#7a2230,#4a121b)] font-serif text-4xl text-cream/80">
                ❋
              </div>
              <div className="p-4">
                <h3 className="font-serif text-sm font-semibold uppercase tracking-wide text-maroon">
                  {b.name}
                </h3>
                <div className="mt-1 text-xs opacity-70">
                  {b.slots} ô · bánh {b.weight}g
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-serif text-base font-semibold text-maroon-deep">
                    {formatMoney(region === "vn" ? b.price_vn : b.price_kr, region)}
                  </span>
                  <a
                    href="/dat-hang"
                    className="rounded bg-gold px-3.5 py-2 font-serif text-xs font-semibold uppercase tracking-wide text-maroon-deep"
                  >
                    Chọn
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* editorial */}
      <div className="bg-maroon px-6 py-10 text-center text-cream">
        <div className="mb-3 tracking-[0.4em] text-gold opacity-60">✦ ❁ ✦ ❁ ✦</div>
        <h2 className="font-serif text-[22px] font-semibold italic leading-snug">
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
          href="/dat-hang"
          className="rounded bg-gold px-5 py-3 font-serif text-xs font-semibold uppercase tracking-widest text-maroon-deep"
        >
          Đặt bánh
        </a>
      </div>
    </main>
  );
}
