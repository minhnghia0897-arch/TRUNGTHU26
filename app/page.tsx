import { getBoxes, getFlavors } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { Badge, Region } from "@/lib/types";
import { IconLotus, IconStar } from "@/components/icons";

// hash ổn định từ id → dùng cho “đánh giá”/“% giảm” demo (server component: không dùng random)
function seed(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return h;
}
const ratingOf = (id: string) => 4.6 + (seed(id) % 4) * 0.1; // 4.6–4.9
const reviewsOf = (id: string) => 80 + (seed(id + "r") % 3200);
const discountOf = (id: string) => 8 + (seed(id + "d") % 5) * 5; // 8,13,18,23,28%

type Tile = {
  id: string;
  name: string;
  price: number;
  region: Region;
  badge?: Badge;
  weight: number;
  href: string;
  tag: string;
};

function StarRow({ id }: { id: string }) {
  const r = ratingOf(id);
  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="flex items-center gap-0.5 text-[#ff6f61]">
        <IconStar width={11} height={11} />
        <b className="font-semibold text-ink">{r.toFixed(1)}</b>
      </span>
      <span className="text-ink/40">({reviewsOf(id).toLocaleString("en-US")})</span>
    </div>
  );
}

function ProductCard({ t }: { t: Tile }) {
  const disc = discountOf(t.id);
  const original = Math.round((t.price / (100 - disc)) * 100);
  const isBest = t.badge === "best_seller";
  return (
    <a href={t.href} className="group flex flex-col overflow-hidden rounded-lg border border-slate-100 bg-white">
      {/* ảnh (placeholder — bản thật thay bằng ảnh sản phẩm) */}
      <div className="relative flex aspect-square items-center justify-center bg-gradient-to-br from-[#F6E9CE] via-[#EFD9A8] to-[#E4C078]">
        <span className="text-[52px] drop-shadow-sm transition group-hover:scale-105">🥮</span>
        <IconLotus width={26} height={26} className="absolute right-2 top-2 text-white/35" />
        {t.badge && (
          <span
            className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${isBest ? "bg-[#cf1a1a]" : "bg-[#346aff]"}`}
          >
            {isBest ? "BÁN CHẠY" : "NÊN THỬ"}
          </span>
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {t.weight}g
        </span>
      </div>

      <div className="flex flex-1 flex-col p-2">
        {/* badge giao nhanh kiểu 로켓배송 */}
        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-[#346aff]">
          <span>🚀</span>
          <span>Giao nhanh</span>
        </div>
        <h3 className="line-clamp-2 min-h-[32px] text-[12.5px] leading-snug text-ink/90">{t.name}</h3>

        {/* giá đỏ + % giảm kiểu Coupang */}
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-[13px] font-extrabold text-[#cf1a1a]">{disc}%</span>
          <span className="text-[15px] font-extrabold text-ink">{formatMoney(t.price, t.region)}</span>
        </div>
        <div className="text-[10.5px] text-ink/35 line-through">{formatMoney(original, t.region)}</div>

        <div className="mt-1.5">
          <StarRow id={t.id} />
        </div>
        <div className="mt-1 text-[10px] font-medium text-emerald-600">Miễn phí giao · nhận trong ngày</div>
      </div>
    </a>
  );
}

// Storefront — server component, look Coupang. Vùng mặc định KR (§5).
export default async function Home({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const sp = await searchParams;
  const region: Region = sp.region === "vn" ? "vn" : "kr";
  const [boxes, flavors] = await Promise.all([getBoxes(), getFlavors()]);
  const price = (o: { price_vn: number; price_kr: number }) => (region === "vn" ? o.price_vn : o.price_kr);

  const tiles: Tile[] = [
    ...boxes.map((b) => ({
      id: b.id,
      name: b.name,
      price: price(b),
      region,
      badge: b.badge,
      weight: b.weight,
      href: `/dat-hang?box=${b.id}&region=${region}`,
      tag: "hộp",
    })),
    ...flavors.map((f) => ({
      id: f.id,
      name: `Bánh ${f.name}`,
      price: price(f),
      region,
      badge: f.badge,
      weight: f.weight,
      href: `/san-pham?region=${region}`,
      tag: "bánh",
    })),
  ];

  const cats = [
    { icon: "🎁", label: "Hộp quà" },
    { icon: "🥮", label: "Bánh lẻ" },
    { icon: "⭐", label: "Bán chạy" },
    { icon: "🍃", label: "Chay" },
    { icon: "🚀", label: "Giao nhanh" },
    { icon: "🏷️", label: "Khuyến mãi" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-app bg-slate-100 pb-16">
      {/* top bar Coupang blue */}
      <header className="sticky top-0 z-20 bg-[#346aff]">
        <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
          <div className="text-[19px] font-extrabold italic tracking-tight text-white">Trăng Rằm</div>
          <a href="/tra-cuu" className="ml-auto text-white" aria-label="Tra cứu đơn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </a>
        </div>
        {/* ô tìm kiếm */}
        <div className="px-3 pb-2.5">
          <a href="/san-pham" className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-[12.5px] text-ink/45">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#346aff" strokeWidth="2.4">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            Tìm bánh trung thu, hộp quà…
          </a>
        </div>
        {/* danh mục cuộn ngang */}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none]">
          {cats.map((c) => (
            <a
              key={c.label}
              href="/san-pham"
              className="flex shrink-0 flex-col items-center gap-0.5 rounded-md px-2.5 py-1 text-[10.5px] font-medium text-white/95"
            >
              <span className="text-[17px]">{c.icon}</span>
              {c.label}
            </a>
          ))}
        </nav>
      </header>

      {/* promo banner */}
      <section className="bg-white">
        <div className="m-2 flex items-center justify-between rounded-lg bg-gradient-to-r from-[#1C2B45] to-[#2a3d5f] px-4 py-3.5 text-cream">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gold">Trung Thu 2026</div>
            <div className="mt-0.5 text-[16px] font-bold">Trọn vị đoàn viên</div>
            <div className="text-[11px] opacity-80">Giao toàn quốc VN &amp; Hàn · nhận trong ngày</div>
          </div>
          <a href="/san-pham" className="rounded-full bg-gold px-4 py-2 text-[12px] font-bold text-[#14203A]">
            Mua ngay
          </a>
        </div>
      </section>

      {/* region switch */}
      <div className="flex gap-2 bg-white px-2 pb-2 text-[11.5px]">
        <a
          href="/?region=kr"
          className={`flex-1 rounded-md border py-1.5 text-center font-semibold ${region === "kr" ? "border-[#346aff] bg-[#eef3ff] text-[#346aff]" : "border-slate-200 text-ink/60"}`}
        >
          🇰🇷 Giao ở Hàn · ₩
        </a>
        <a
          href="/?region=vn"
          className={`flex-1 rounded-md border py-1.5 text-center font-semibold ${region === "vn" ? "border-[#346aff] bg-[#eef3ff] text-[#346aff]" : "border-slate-200 text-ink/60"}`}
        >
          🇻🇳 Giao ở VN · đ
        </a>
      </div>

      {/* section title */}
      <div className="flex items-center gap-2 bg-white px-3 pb-1 pt-2">
        <span className="text-[15px] font-bold text-ink">🚀 Giao nhanh hôm nay</span>
        <span className="text-[11px] text-ink/40">{tiles.length} sản phẩm</span>
      </div>

      {/* lưới sản phẩm 2 cột */}
      <section className="grid grid-cols-2 gap-1.5 bg-white p-1.5">
        {tiles.map((t) => (
          <ProductCard key={t.id} t={t} />
        ))}
      </section>

      {/* nguồn dữ liệu */}
      <div className="px-3 py-3 text-center text-[10px] text-ink/40">
        Nguồn: {isSupabaseConfigured ? "Supabase" : "seed demo"} · {boxes.length} hộp · {flavors.length} vị · giá & %
        giảm minh hoạ
      </div>

      {/* sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-app items-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
        <a href="/tra-cuu" className="rounded-md border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-ink/70">
          Tra đơn
        </a>
        <a
          href="/dat-hang"
          className="flex-1 rounded-md bg-[#346aff] py-2.5 text-center text-[13px] font-bold text-white"
        >
          Đặt bánh ngay
        </a>
      </div>
    </main>
  );
}
