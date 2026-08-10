import { getBoxes, getFlavors } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import type { Box, Region } from "@/lib/types";

export const metadata = { title: "Trăng Rằm — Doanh nghiệp" };

const GOLD = "bg-gradient-to-b from-[#F7EBC0] via-[#E8C877] to-[#C6A24C] bg-clip-text text-transparent";
const tier = (p: number, k: number) => Math.round((p * k) / 1000) * 1000;

function GoldIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[#C6A24C]/55 bg-white/[0.02] text-[#E8C877]">
      {children}
    </div>
  );
}

function Feature({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#C6A24C]/45 bg-white/[0.03] p-4">
      <GoldIcon>{icon}</GoldIcon>
      <div className="min-w-0">
        <div className={`text-[14px] font-bold leading-tight ${GOLD}`}>{title}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-cream/65">{sub}</div>
      </div>
    </div>
  );
}

function PriceTable({ box, region }: { box: Box; region: Region }) {
  const retail = region === "vn" ? box.price_vn : box.price_kr;
  const cells = [
    ["Bán lẻ", formatMoney(retail, region)],
    ["10–50", formatMoney(tier(retail, 0.9), region)],
    ["51–100", formatMoney(tier(retail, 0.82), region)],
    ["101+", "Liên hệ"],
  ];
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-[#C6A24C]/40">
      <table className="w-full table-fixed text-center text-[10px]">
        <thead>
          <tr className="bg-[#C6A24C]/12 text-[#E8C877]">
            <th className="px-1 py-1.5 font-semibold">SL</th>
            {cells.map((c) => (
              <th key={c[0]} className="px-1 py-1.5 font-semibold">{c[0]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-[#C6A24C]/25">
            <td className="px-1 py-1.5 font-bold text-[#E8C877]">Giá</td>
            {cells.map((c) => (
              <td key={c[0]} className="px-1 py-1.5 font-semibold text-cream/90">{c[1]}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BoxCard({ box, region }: { box: Box; region: Region }) {
  const specs = (box.specs ?? {}) as { material?: string; pieces?: string };
  const bullets = [
    box.description ?? `${box.slots} bánh ${box.weight}g`,
    specs.pieces ?? `${box.slots} bánh nướng truyền thống`,
    specs.material ? `Hộp ${specs.material}` : "Hộp ép kim sang trọng",
    "Thiệp chúc mừng · giao toàn quốc",
  ];
  return (
    <article className="overflow-hidden rounded-2xl border border-[#C6A24C]/40 bg-[#0c1a31]/70">
      <div className="p-4">
        <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-xl border border-[#C6A24C]/50 bg-gradient-to-br from-[#15294a] via-[#0f2038] to-[#081221]">
          <span className="text-[72px] drop-shadow-lg">🥮</span>
          <span className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded border border-[#C6A24C]/70 text-[10px] font-bold text-[#E8C877]">
            2026
          </span>
          {box.badge && (
            <span className="absolute left-2.5 top-2.5 rounded border border-[#C6A24C]/60 bg-[#0a1526]/70 px-2 py-0.5 text-[9px] font-bold text-[#E8C877]">
              {box.badge === "best_seller" ? "BÁN CHẠY NHẤT" : "NÊN THỬ"}
            </span>
          )}
        </div>
        <h3 className={`mt-3 text-[20px] font-extrabold uppercase leading-tight tracking-wide ${GOLD}`}>{box.name}</h3>
        <ul className="mt-2 space-y-1">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-snug text-cream/80">
              <span className="text-[#E8C877]">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <PriceTable box={box} region={region} />
        <a
          href="#lien-he"
          className="mt-3 block rounded-lg border border-[#C6A24C]/60 py-2.5 text-center text-[12.5px] font-semibold uppercase tracking-wide text-[#E8C877]"
        >
          Liên hệ báo giá số lượng
        </a>
      </div>
    </article>
  );
}

// Luồng DOANH NGHIỆP — website responsive (desktop rộng + mobile), tĩnh. Cách ly luồng lẻ.
export default async function DoanhNghiepPage({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const sp = await searchParams;
  const region: Region = sp.region === "vn" ? "vn" : "kr";
  const [boxes, flavors] = await Promise.all([getBoxes(), getFlavors()]);

  const stats = [
    ["100+", "Doanh nghiệp tin dùng"],
    ["5 năm", "Kinh nghiệm làm bánh"],
    ["30+", "Vị bánh ngon"],
    ["Độc bản", "Công thức riêng"],
  ];

  return (
    <main className="min-h-screen bg-[#0a1526] text-cream">
      {/* hotline */}
      <div className="border-b border-[#C6A24C]/20 bg-[#081221] px-4 py-2 text-center text-[11px] tracking-wide text-cream/80 md:text-[12px]">
        Giao toàn quốc VN &amp; Hàn Quốc · Hotline <b className="text-[#E8C877]">0982 576 263</b> · Zalo/Messenger tư vấn số lượng
      </div>

      {/* header */}
      <header className="border-b border-[#C6A24C]/25 bg-[#0a1526]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
          <div>
            <div className={`text-[20px] font-extrabold uppercase tracking-[0.2em] md:text-[24px] ${GOLD}`}>Trăng Rằm</div>
            <div className="text-[10px] italic tracking-wide text-cream/55 md:text-[11px]">Dịch vụ quà biếu doanh nghiệp</div>
          </div>
          <nav className="hidden gap-7 text-[12px] uppercase tracking-widest text-[#E8C877]/85 md:flex">
            <a href="#dich-vu">Dịch vụ</a>
            <a href="#bang-gia">Bảng giá</a>
            <a href="#lien-he">Liên hệ</a>
          </nav>
          <a
            href="#lien-he"
            className="rounded-full bg-gradient-to-b from-[#E8C877] to-[#C6A24C] px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-[#14203A] md:hidden"
          >
            Báo giá
          </a>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_90%_at_50%_-10%,#274063_0%,#132444_45%,#0a1526_100%)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(232,200,119,0.16),transparent_70%)]" />
        <div className="relative mx-auto max-w-5xl px-4 py-14 text-center md:px-8 md:py-20">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#E8C877]/80">Trung Thu 2026 · Quà biếu doanh nghiệp</div>
          <h1 className={`mx-auto my-4 max-w-3xl text-[30px] font-extrabold uppercase leading-[1.08] tracking-wide md:text-[46px] ${GOLD}`}>
            Dịch vụ doanh nghiệp
          </h1>
          <p className="mx-auto mb-7 max-w-[460px] text-[13px] leading-relaxed text-cream/75 md:text-[15px]">
            Đặt bánh Trung Thu số lượng lớn, xuất hoá đơn VAT, in logo lên hộp, chiết khấu theo số lượng — giao toàn quốc VN &amp; Hàn.
          </p>
          <a
            href="#lien-he"
            className="inline-block rounded-full bg-gradient-to-b from-[#E8C877] to-[#C6A24C] px-8 py-3.5 text-[13px] font-bold uppercase tracking-wide text-[#14203A]"
          >
            Nhận báo giá
          </a>
        </div>
      </section>

      {/* dịch vụ */}
      <section id="dich-vu" className="mx-auto max-w-5xl px-4 py-12 md:px-8 md:py-16">
        <h2 className={`text-center text-[22px] font-extrabold uppercase tracking-wide md:text-[28px] ${GOLD}`}>
          Dịch vụ doanh nghiệp
        </h2>
        <div className="mx-auto mt-6 grid max-w-3xl gap-3 md:grid-cols-2">
          <Feature icon={<span className="text-[11px] font-bold">VAT</span>} title="Xuất hoá đơn VAT đầy đủ" sub="Cho mọi đơn hàng doanh nghiệp" />
          <Feature icon={<span className="text-[10px] font-bold tracking-tight">LOGO</span>} title="In logo / thư chúc mừng" sub="Miễn phí với đơn đủ số lượng" />
          <Feature
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M1 3h13v11H1zM14 7h4l3 3v4h-7z" /><circle cx="5.5" cy="17.5" r="1.6" /><circle cx="17.5" cy="17.5" r="1.6" />
              </svg>
            }
            title="Giao hàng toàn quốc"
            sub="Hoả tốc cho đơn hàng gấp"
          />
          <Feature
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" /><path d="M8 8h.01M16 16h.01M16 8 8 16" />
              </svg>
            }
            title="Chiết khấu theo số lượng"
            sub="Tốt hơn từ 50 hộp trở lên"
          />
        </div>

        {/* điểm tin cậy */}
        <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={v} className="rounded-2xl border border-[#C6A24C]/45 bg-[#0d1a30]/70 p-4 text-center">
              <div className={`text-[22px] font-extrabold leading-none md:text-[26px] ${GOLD}`}>{k}</div>
              <div className="mt-1.5 text-[11px] leading-snug text-cream/70">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* bảng giá theo số lượng */}
      <section id="bang-gia" className="mx-auto max-w-5xl px-4 pb-12 md:px-8 md:pb-16">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <h2 className={`text-[22px] font-extrabold uppercase tracking-wide md:text-[28px] ${GOLD}`}>Bảng giá theo số lượng</h2>
          {/* chọn tiền tệ (giữ trong luồng B2B) */}
          <div className="flex gap-2 text-[11.5px]">
            <a href="/doanh-nghiep?region=kr" className={`rounded-lg border px-4 py-2 font-semibold ${region === "kr" ? "border-[#C6A24C] bg-[#C6A24C]/12 text-[#E8C877]" : "border-[#C6A24C]/30 text-cream/60"}`}>
              🇰🇷 ₩ Hàn
            </a>
            <a href="/doanh-nghiep?region=vn" className={`rounded-lg border px-4 py-2 font-semibold ${region === "vn" ? "border-[#C6A24C] bg-[#C6A24C]/12 text-[#E8C877]" : "border-[#C6A24C]/30 text-cream/60"}`}>
              🇻🇳 đ VN
            </a>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {boxes.map((b) => (
            <BoxCard key={b.id} box={b} region={region} />
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] text-cream/40">
          Bảng giá số lượng minh hoạ · {boxes.length} hộp · {flavors.length} vị · giá cuối theo báo giá thực tế
        </p>
      </section>

      {/* liên hệ / CTA */}
      <section id="lien-he" className="border-t border-[#C6A24C]/25 bg-[#081221]">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center md:px-8">
          <h2 className={`text-[22px] font-extrabold uppercase tracking-wide md:text-[28px] ${GOLD}`}>Nhận báo giá doanh nghiệp</h2>
          <p className="mx-auto mt-3 max-w-[460px] text-[13px] text-cream/75">
            Gọi hotline hoặc nhắn Zalo/Messenger, gửi số lượng &amp; loại hộp — bên em báo giá và xuất VAT trong ngày.
          </p>
          <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <a href="tel:0982576263" className="rounded-lg bg-gradient-to-b from-[#E8C877] to-[#C6A24C] px-6 py-3 text-[14px] font-bold text-[#14203A]">
              📞 Gọi 0982 576 263
            </a>
            <a href="https://zalo.me/0982576263" className="rounded-lg border border-[#C6A24C]/60 px-6 py-3 text-[14px] font-semibold text-[#E8C877]">
              💬 Zalo 0982 576 263
            </a>
            <a href="https://m.me/doranking88" className="rounded-lg border border-[#C6A24C]/60 px-6 py-3 text-[14px] font-semibold text-[#E8C877]">
              Ⓜ️ Messenger
            </a>
          </div>
        </div>
      </section>

      {/* lưu ý */}
      <div className="border-t border-[#C6A24C]/35 bg-[#0a1526] px-4 py-3 text-center text-[10.5px] font-semibold uppercase tracking-wide text-[#E8C877]/90">
        Lưu ý: giá đã gồm VAT, chưa gồm phí vận chuyển
      </div>
    </main>
  );
}
