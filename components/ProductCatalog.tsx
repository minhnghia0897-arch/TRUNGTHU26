"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_PRODUCT_IMAGES, type Badge, type Box, type Combo, type Flavor, type Region } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import {
  boxPrice,
  flavorRetailPrice,
  flavorSurcharge,
  findFlavorByName,
  type CartLine,
  comboPrice,
  comboOptions,
  comboPickCount,
  comboPickPool,
  describePickedFlavors,
} from "@/lib/pricing";
import {
  IconLotus,
  IconCrown,
  IconStar,
  IconCheck,
  IconGrid,
  IconGift,
  IconCart,
  IconArrowRight,
} from "@/components/icons";

type Tab = "box" | "combo" | "la";

// Giỏ hàng dùng chung với trang Đặt hàng (OrderFlow đọc lại đúng key này khi mở /dat-hang).
const CART_KEY = "tr_cart";
type CartBlob = { cart?: CartLine[]; buyerRegion?: Region; [k: string]: unknown };

function readCart(): CartBlob {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "{}") as CartBlob;
  } catch {
    return {};
  }
}
const countCart = (c?: CartLine[]) => (c ?? []).reduce((n, l) => n + l.qty, 0);
// uid nối tiếp kiểu "u<số>" cho khớp cách OrderFlow sinh uid (tránh trùng)
function nextUid(cart: CartLine[]): string {
  const max = cart.reduce((m, l) => Math.max(m, parseInt(String(l.uid).replace(/\D/g, "")) || 0), 0);
  return "u" + (max + 1);
}

/* ---------- primitives ---------- */
function BadgeChip({ badge }: { badge?: Badge }) {
  if (!badge) return null;
  const isBest = badge === "best_seller";
  return (
    <div
      className={`absolute right-2.5 top-2.5 flex h-12 w-12 flex-col items-center justify-center rounded-full text-center text-[7px] font-bold uppercase leading-tight tracking-wide text-white shadow-md ${
        isBest ? "bg-gradient-to-br from-gold to-gold-deep" : "bg-navy"
      }`}
    >
      {isBest ? <IconCrown width={13} height={13} /> : <IconStar width={13} height={13} />}
      <span className="mt-0.5">{isBest ? "Best\nSeller" : "Must\nTry"}</span>
    </div>
  );
}

function WeightChip({ w }: { w?: number }) {
  if (!w) return null;
  return (
    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded bg-gold/90 px-2 py-0.5 text-[10px] font-semibold text-white">
      <IconCheck width={11} height={11} />
      {w}GR
    </div>
  );
}

function Price({ v, region }: { v: number; region: Region }) {
  const s = formatMoney(v, region);
  return (
    <span className="price-lg text-lg">
      {s} <span className="unit">/ hộp</span>
    </span>
  );
}

/**
 * Một dòng vị bánh trong popup chi tiết: ảnh vuông 48px + tên.
 *
 * Dùng chung cho CẢ HAI danh sách vị — "Gồm N vị" (set một giá, có sẵn id vị) và
 * "Chọn loại nhân" (set nhiều lựa chọn, chỉ có tên dạng chữ). Hai chỗ đó trước
 * đây lặp cùng một khối dấu chấm đầu dòng; gom về một chỗ để sau này đổi cỡ ảnh
 * là đổi một lần.
 *
 * CHƯA CÓ ẢNH LÀ TRẠNG THÁI THƯỜNG GẶP, không phải ngoại lệ: hiện cả 14 vị trong
 * danh mục đều chưa có ảnh nào. Nên ô giữ chỗ phải cùng cỡ, cùng bo góc với ảnh
 * thật — trộn vị có ảnh với vị chưa có thì hàng vẫn thẳng — và trông ra dáng chứ
 * không phải ô xám: hoa văn khuôn bánh chìm + chữ cái đầu của vị.
 */
function FlavorRow({ name, img, right }: { name: string; img?: string; right?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[12.5px] text-ink/75">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt={name}
          className="h-12 w-12 flex-none rounded-lg border border-line object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid h-12 w-12 flex-none place-items-center rounded-lg border border-line bg-cream-soft font-serif text-[17px] font-bold text-gold"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, rgba(198,162,76,0.18) 0 38%, transparent 39%)," +
              "repeating-conic-gradient(from 0deg at 50% 50%, rgba(198,162,76,0.14) 0deg 14deg, transparent 14deg 28deg)",
          }}
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1">{name}</span>
      {right}
    </li>
  );
}

/**
 * Khay hộp bánh: một ngăn cho mỗi bánh khách phải chọn.
 *
 * Bốc bánh nào là bánh đó "nằm vào ngăn" — ảnh vị hiện trong ô, khách nhìn thấy
 * ngay hộp của mình đang có gì và còn trống mấy ngăn, thay vì phải nhẩm từ mấy
 * con số cạnh nút − +. Bấm vào ngăn đã có bánh là bỏ bánh đó ra (đường tắt của
 * nút − phía dưới).
 *
 * Ngăn xếp theo THỨ TỰ danh sách vị chứ không theo thứ tự bấm — không phải giữ
 * thêm lịch sử bấm, và hai người chọn cùng một bộ vị luôn thấy khay giống hệt
 * nhau.
 */
function PickTray({
  slots,
  filled,
  onRemove,
}: {
  slots: number;
  filled: { id: string; name: string; img?: string }[];
  onRemove: (flavorId: string) => void;
}) {
  return (
    <div
      className="mt-3 grid gap-2"
      style={{ gridTemplateColumns: `repeat(${Math.min(slots, 4)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: slots }, (_, i) => {
        const f = filled[i];
        if (!f)
          return (
            <div
              key={i}
              className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line bg-white/60 text-[11px] font-medium text-ink/30"
            >
              Ngăn {i + 1}
            </div>
          );
        return (
          <button
            key={i}
            type="button"
            onClick={() => onRemove(f.id)}
            title={`${f.name} — bấm để bỏ ra`}
            className="relative overflow-hidden rounded-xl border border-gold/60 bg-white shadow-sm transition active:scale-95"
          >
            {f.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.img} alt={f.name} className="aspect-square w-full object-cover" />
            ) : (
              <span
                className="grid aspect-square w-full place-items-center bg-cream-soft font-serif text-[19px] font-bold text-gold"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 50% 50%, rgba(198,162,76,0.18) 0 38%, transparent 39%)," +
                    "repeating-conic-gradient(from 0deg at 50% 50%, rgba(198,162,76,0.14) 0deg 14deg, transparent 14deg 28deg)",
                }}
              >
                {f.name.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 truncate bg-navy/70 px-1 py-0.5 text-center text-[8.5px] font-medium leading-tight text-cream">
              {f.name}
            </span>
            <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/45 text-[9px] leading-none text-white">
              ✕
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Nút − số + cho một vị trong set khách tự chọn.
 *
 * Cố ý KHÔNG dùng ô gõ số: khách gõ 9 vào hộp 4 bánh rồi mới bị chặn là bực.
 * Nút cộng tự khoá khi đã đủ số bánh, nên trên màn hình không bao giờ tồn tại
 * một lựa chọn sai.
 */
function PickStepper({
  qty,
  canAdd,
  onChange,
}: {
  qty: number;
  canAdd: boolean;
  onChange: (delta: number) => void;
}) {
  const btn =
    "grid h-8 w-8 flex-none place-items-center rounded-full border text-[15px] font-bold leading-none transition active:scale-90 disabled:opacity-30";
  return (
    <div className="flex flex-none items-center gap-1.5">
      <button
        type="button"
        aria-label="Bớt một bánh"
        disabled={qty === 0}
        onClick={() => onChange(-1)}
        className={`${btn} border-line bg-white text-navy`}
      >
        −
      </button>
      <span
        className={`w-5 text-center text-[14px] font-bold tabular-nums ${qty ? "text-navy" : "text-ink/25"}`}
      >
        {qty}
      </span>
      <button
        type="button"
        aria-label="Thêm một bánh"
        disabled={!canAdd}
        onClick={() => onChange(1)}
        className={`${btn} border-gold bg-gold/15 text-gold-deep`}
      >
        +
      </button>
    </div>
  );
}

/** Khung ảnh 4:5 — lướt qua các ảnh của sản phẩm, bấm vào mở popup xem lớn. */
function ImageArea({
  badge,
  w,
  images = [],
  alt = "",
  onOpen,
  onEmptyClick,
}: {
  badge?: Badge;
  w?: number;
  images?: string[];
  alt?: string;
  onOpen?: (i: number) => void;
  /** Bấm vào ô ảnh trống. Sản phẩm chưa có ảnh vẫn phải mở được chi tiết. */
  onEmptyClick?: () => void;
}) {
  const [i, setI] = useState(0);
  const n = images.length;
  const go = (e: React.MouseEvent, d: number) => {
    e.preventDefault();
    e.stopPropagation();
    setI((v) => (v + d + n) % n);
  };
  return (
    <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-cream-soft">
      {n > 0 ? (
        <button type="button" onClick={() => onOpen?.(i)} aria-label={`Xem ảnh ${alt}`} className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[i]} alt={alt} className="h-full w-full object-cover" />
        </button>
      ) : onEmptyClick ? (
        <button
          type="button"
          onClick={onEmptyClick}
          aria-label={`Xem chi tiết ${alt}`}
          className="absolute inset-0 flex items-center justify-center"
        >
          <IconLotus width={54} height={54} className="text-gold/45" />
        </button>
      ) : (
        <IconLotus width={54} height={54} className="text-gold/45" />
      )}
      <BadgeChip badge={badge} />
      <WeightChip w={w} />
      {n > 1 && (
        <>
          <button
            onClick={(e) => go(e, -1)}
            aria-label="Ảnh trước"
            className="absolute left-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[15px] font-bold leading-none text-navy shadow"
          >
            ‹
          </button>
          <button
            onClick={(e) => go(e, 1)}
            aria-label="Ảnh sau"
            className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[15px] font-bold leading-none text-navy shadow"
          >
            ›
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
            {images.map((_, k) => (
              <span
                key={k}
                className={`h-1.5 rounded-full transition-all ${k === i ? "w-3 bg-navy" : "w-1.5 bg-navy/35"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Popup xem ảnh lớn ngay trong trang — lướt trái/phải, vuốt trên điện thoại. */
function Lightbox({
  images,
  index,
  title,
  onClose,
}: {
  images: string[];
  index: number;
  title: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(index);
  const n = images.length;
  const x0 = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + n) % n);
      if (e.key === "ArrowRight") setI((v) => (v + 1) % n);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [n, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-cream" onClick={(e) => e.stopPropagation()}>
        <span className="text-[12.5px] font-medium">{title}</span>
        <span className="text-[12px] opacity-70">{i + 1}/{n}</span>
        <button onClick={onClose} aria-label="Đóng" className="text-[22px] leading-none text-cream">
          ✕
        </button>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center px-3"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (x0.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (x0.current === null) return;
          const d = e.changedTouches[0].clientX - x0.current;
          if (Math.abs(d) > 40) setI((v) => (v + (d < 0 ? 1 : -1) + n) % n);
          x0.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i]} alt={title} className="max-h-full max-w-full rounded-lg object-contain" />
        {n > 1 && (
          <>
            <button
              onClick={() => setI((v) => (v - 1 + n) % n)}
              aria-label="Ảnh trước"
              className="absolute left-2 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-[22px] leading-none text-cream backdrop-blur"
            >
              ‹
            </button>
            <button
              onClick={() => setI((v) => (v + 1) % n)}
              aria-label="Ảnh sau"
              className="absolute right-2 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-[22px] leading-none text-cream backdrop-blur"
            >
              ›
            </button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="flex justify-center gap-2 px-4 py-4" onClick={(e) => e.stopPropagation()}>
          {images.map((src, k) => (
            <button
              key={k}
              onClick={() => setI(k)}
              aria-label={`Ảnh ${k + 1}`}
              className={`h-12 w-12 overflow-hidden rounded border-2 transition ${k === i ? "border-gold" : "border-transparent opacity-60"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- main ---------- */
export default function ProductCatalog({
  boxes,
  flavors,
  combos,
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
}) {
  const [region, setRegion] = useState<Region>("kr");
  // Vị chỉ dùng để ghép set (không đặt giá lẻ) thì không bày ở "Mua lẻ" — bày
  // ra là khách mua được cái bánh giá 0.
  const retailFlavors = flavors.filter((f) => flavorRetailPrice(f, region) > 0);
  const sellableCombos = combos.filter((c) => comboPrice(c, boxes, flavors, region) !== null);

  // Menu bán theo set thì mục "Hộp tự chọn" rỗng. Ẩn mục rỗng và mở mục đầu
  // tiên có hàng, thay vì đổ khách vào một trang trắng.
  const tabDefs = (
    [
      ["box", "Hộp tự chọn", IconGrid, boxes.length],
      ["combo", "Bộ quà tặng", IconGift, sellableCombos.length],
      ["la", "Mua lẻ", IconCart, retailFlavors.length],
    ] as [Tab, string, typeof IconGrid, number][]
  ).filter(([, , , n]) => n > 0);

  const [tab, setTab] = useState<Tab>(tabDefs[0]?.[0] ?? "combo");
  const [cartCount, setCartCount] = useState(0);
  const [added, setAdded] = useState<string>(""); // uid món vừa thêm → đổi nhãn nút

  // key `box:<id>` / `combo:<id>` / `flavor:<id>` → danh sách URL ảnh
  const imgsByKey = useMemo(() => {
    const m: Record<string, string[]> = {};
    const put = (key: string, images?: string[]) => {
      const list = (images ?? []).filter(Boolean).slice(0, MAX_PRODUCT_IMAGES);
      if (list.length) m[key] = list;
    };
    boxes.forEach((b) => put(`box:${b.id}`, b.images));
    combos.forEach((c) => put(`combo:${c.id}`, c.images));
    flavors.forEach((f) => put(`flavor:${f.id}`, f.images));
    return m;
  }, [boxes, combos, flavors]);

  // Ảnh sản phẩm lấy thẳng từ danh mục do máy chủ truyền xuống.
  // Trước đây đọc localStorage "tr_product_edits" nên ảnh chỉ hiện trên máy đã
  // upload — khách vào web thấy khung trắng. Giờ ảnh nằm trên Supabase Storage.
  // Bộ quà tặng đang mở chi tiết. Thẻ ngoài danh sách cố tình gọn — ảnh lớn,
  // mô tả đầy đủ và danh sách vị của từng loại nhân nằm ở đây.
  const [detail, setDetail] = useState<Combo | null>(null);

  // Set cho khách tự chọn vị (§0025): id vị → số bánh khách đã bốc.
  // Xoá sạch mỗi lần mở set khác — không thì set sau thừa hưởng lựa chọn của
  // set trước và khách bấm "Thêm vào giỏ" ra một hộp mình chưa hề chọn.
  const [picks, setPicks] = useState<Record<string, number>>({});
  useEffect(() => setPicks({}), [detail?.id]);
  /** Danh sách vị đã bốc, dạng phẳng — trùng vị thì lặp lại đúng số lần. */
  const pickedIds = (pool: { id: string }[]) =>
    pool.flatMap((f) => Array.from({ length: picks[f.id] ?? 0 }, () => f.id));

  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; title: string } | null>(null);
  const imagesOf = (key: string) => imgsByKey[key] ?? [];

  useEffect(() => {
    setCartCount(countCart(readCart().cart));
  }, []);

  /**
   * Popup chi tiết: bấm Esc để đóng, và khoá cuộn trang nền khi đang mở.
   *
   * Popup xem ảnh lớn đã có cả hai từ đầu, popup này thì quên — nên khách cuộn
   * trong popup mà chạm mép là cuộn luôn trang đằng sau, popup trôi đi đâu mất.
   * Cùng với việc nút Đóng cuộn mất (đã sửa bên dưới), đó là lý do "thi thoảng
   * không thoát ra được".
   */
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [detail]);

  /** Thêm vào giỏ ngay tại trang: trùng món thì cộng dồn số lượng, không chuyển trang. */
  function addToCart(key: string, line: Omit<CartLine, "uid" | "qty" | "recipientUids">) {
    const blob = readCart();
    const cart = [...(blob.cart ?? [])];
    // So CẢ danh sách vị chứ không chỉ vị đầu: set khách tự chọn thì hai hộp
    // "Trà Xanh ×2 + Lava ×2" và "Trà Xanh ×1 + Lava ×3" đều bắt đầu bằng trà
    // xanh — so mỗi vị đầu là hai hộp khác nhau bị gộp làm một.
    const sameFlavors = (a?: string[], b?: string[]) =>
      [...(a ?? [])].sort().join("|") === [...(b ?? [])].sort().join("|");
    const same = cart.findIndex(
      (l) =>
        l.kind === line.kind &&
        l.comboId === line.comboId &&
        l.variantName === line.variantName &&
        sameFlavors(l.flavorIds, line.flavorIds),
    );
    if (same >= 0) cart[same] = { ...cart[same], qty: cart[same].qty + 1 };
    else cart.push({ ...line, uid: nextUid(cart), qty: 1, recipientUids: [] });

    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ ...blob, cart, buyerRegion: region }));
    } catch {
      /* ignore */
    }
    setCartCount(countCart(cart));
    setAdded(key);
    setTimeout(() => setAdded((k) => (k === key ? "" : k)), 1400);
  }

  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream pb-24">
      {/* hotline */}
      <div className="bg-[#081221] px-3 py-2 text-center text-[11px] tracking-wide text-cream/80">
        Giao toàn quốc VN &amp; Hàn Quốc · Hotline <b className="text-[#E8C877]">0982 576 263</b>
      </div>

      {/* header — bộ sưu tập là trang chính của luồng khách lẻ */}
      <header className="bg-navy px-4 pb-3 pt-3.5 text-center">
        <a href="/san-pham" className="title-heritage text-base tracking-[0.18em] !text-[#E8C877]">
          Doran King
        </a>
        <div className="mt-0.5 text-[10px] italic tracking-wide text-cream/55">Bánh Trung Thu thủ công cao cấp</div>
        <nav className="mt-2.5 flex justify-center gap-6 text-[11px] uppercase tracking-widest text-[#E8C877]/85">
          <a href="/dat-hang">Đặt hàng</a>
          <a href="/tra-cuu">Tra cứu đơn</a>
        </nav>
      </header>

      <div className="px-4 pt-5 text-center">
        <div className="eyebrow">Ba cách chọn quà</div>
        <h1 className="title-heritage mt-1 text-2xl">Sản phẩm</h1>
      </div>

      {/* region */}
      <div className="flex justify-center gap-2 px-4 py-3 text-[11px]">
        {(["kr", "vn"] as Region[]).map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={`rounded-full border px-4 py-2 font-semibold uppercase tracking-wide transition ${region === r ? "border-navy bg-navy text-cream" : "border-line bg-white text-navy"}`}
          >
            {r === "kr" ? "🇰🇷 Đặt ở Hàn · ₩" : "🇻🇳 Đặt ở VN · đ"}
          </button>
        ))}
      </div>

      {/* tabs */}
      <div className="sticky top-0 z-10 flex border-b border-line bg-cream/95 px-4 backdrop-blur">
        {tabDefs.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-[11px] font-semibold uppercase tracking-wide transition ${tab === key ? "border-gold text-navy" : "border-transparent text-navy/45"}`}
          >
            <Icon width={15} height={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 py-5">
        {tabDefs.length === 0 && (
          <div className="rounded-card bg-white px-5 py-12 text-center shadow-card">
            <p className="text-[13px] font-semibold text-navy">Chưa mở bán ở khu vực này</p>
            <p className="mt-1.5 text-[11.5px] text-ink/55">
              Bộ quà tặng năm nay đang bán tại Hàn Quốc. Anh/chị bấm “Đặt ở Hàn · ₩” để xem giá,
              hoặc liên hệ hotline 0982 576 263.
            </p>
          </div>
        )}
        {/* HỘP TỰ CHỌN */}
        {tab === "box" && (
          <div className="grid grid-cols-2 gap-3">
            {boxes.map((b) => (
              <article key={b.id} className="flex flex-col overflow-hidden rounded-card bg-white shadow-card">
                <ImageArea
                  badge={b.badge}
                  w={b.weight}
                  images={imagesOf(`box:${b.id}`)}
                  alt={b.name}
                  onOpen={(i) => setLightbox({ images: imagesOf(`box:${b.id}`), index: i, title: b.name })}
                />
                <div className="flex flex-1 flex-col p-3 text-center">
                  <h3 className="text-[13px] font-semibold leading-tight text-navy">{b.name}</h3>
                  {b.description && <p className="mt-1 line-clamp-2 text-[10.5px] text-ink/55">{b.description}</p>}
                  <div className="mt-auto pt-2">
                    <div className="price-lg text-[15px]">
                      {formatMoney(region === "vn" ? b.price_vn : b.price_kr, region)}
                      <span className="unit"> / hộp</span>
                    </div>
                    <a
                      href={`/dat-hang?box=${b.id}&region=${region}&express=1`}
                      className="mt-2 flex items-center justify-center gap-1 rounded-full bg-gold py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-deep"
                    >
                      Tự chọn vị <IconArrowRight width={12} height={12} />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* COMBO */}
        {tab === "combo" && (
          <div className="grid grid-cols-2 gap-3">
            {sellableCombos.map((c) => {
              const price = comboPrice(c, boxes, flavors, region);
              // Không suy được giá (hộp quy cách đã tắt, set chưa đặt giá) thì
              // giấu hẳn thẻ. Trước đây lùi về boxes[0] nên bày giá của hộp khác.
              if (price === null) return null;
              // Hộp chỉ còn là quy cách và thường đã tắt bán, nên có thể không
              // có trong `boxes`. Không mượn hộp khác — chỉ bỏ chip khối lượng.
              const b = boxes.find((x) => x.id === c.box_id);
              const opts = comboOptions(c, region);
              // card 2 cột hẹp → gộp tên vị thành 1 dòng thay vì chip rời.
              // Set tự chọn thì đây là danh sách được chọn, không phải ruột hộp
              // — nói rõ để khách không tưởng hộp có đủ cả 6 bánh.
              const flavorLine = c.flavor_ids
                .map((fid) => flavors.find((x) => x.id === fid)?.name)
                .filter(Boolean)
                .join(" · ");
              return (
                <article key={c.id} className="flex flex-col overflow-hidden rounded-card bg-white shadow-card">
                  <ImageArea
                    // Huy hiệu đọc từ dữ liệu. Trước đây hardcode "best_seller"
                    // nên MỌI bộ quà tặng đều đeo Best Seller — nói sai với khách.
                    badge={c.badge}
                    w={b?.weight}
                    images={imagesOf(`combo:${c.id}`)}
                    alt={c.name}
                    onOpen={() => setDetail(c)}
                    onEmptyClick={() => setDetail(c)}
                  />
                  <div className="flex flex-1 flex-col p-3 text-center">
                    <button
                      onClick={() => setDetail(c)}
                      className="text-[13px] font-semibold leading-tight text-navy underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </button>
                    {(c.description || flavorLine) && (
                      <p className="mt-1 line-clamp-2 text-[10.5px] text-ink/55">
                        {c.description || (comboPickCount(c) ? `Chọn ${comboPickCount(c)} trong: ${flavorLine}` : flavorLine)}
                      </p>
                    )}
                    <div className="mt-auto pt-2">
                      <div className="price-lg text-[15px]">
                        {opts.length > 1 && <span className="unit">từ </span>}
                        {formatMoney(price, region)}
                        <span className="unit"> / hộp</span>
                      </div>

                      {comboPickCount(c) ? (
                        // Set khách tự chọn vị: không thêm thẳng vào giỏ được
                        // vì chưa biết khách muốn vị nào. Thẻ ngoài chỉ mời vào
                        // trong chọn.
                        <button
                          onClick={() => setDetail(c)}
                          className="mt-2 flex w-full items-center justify-center gap-1 rounded-full bg-gold py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-deep transition active:scale-95"
                        >
                          Chọn {comboPickCount(c)} vị
                          <IconArrowRight width={12} height={12} />
                        </button>
                      ) : opts.length ? (
                        // Set nhiều lựa chọn: mỗi loại nhân một nút, kèm giá của
                        // chính nó — khách thấy ngay chênh lệch, không phải bấm vào
                        // rồi mới biết.
                        <div className="mt-2 space-y-1.5">
                          {opts.map((o) => {
                            const key = `combo:${c.id}:${o.name}`;
                            return (
                              <button
                                key={o.name}
                                title={o.contents}
                                onClick={() =>
                                  addToCart(key, {
                                    kind: "combo",
                                    boxId: c.box_id ?? undefined,
                                    comboId: c.id,
                                    variantName: o.name,
                                    flavorIds: c.flavor_ids,
                                    unitPrice: o.price,
                                    name: `${c.name} · ${o.name}`,
                                  })
                                }
                                className={`flex w-full flex-col items-center rounded-xl px-2 py-1.5 text-[10.5px] font-semibold leading-tight transition active:scale-95 ${added === key ? "bg-emerald-500 text-white" : "bg-cream-soft text-navy hover:bg-gold/25"}`}
                              >
                                {added === key ? (
                                  <span className="flex items-center gap-1">
                                    <IconCheck width={12} height={12} /> Đã thêm
                                  </span>
                                ) : (
                                  <>
                                    <span>{o.name}</span>
                                    <span className="text-[11px] font-bold text-gold-deep">
                                      {formatMoney(o.price, region)}
                                    </span>
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            addToCart(`combo:${c.id}`, {
                              kind: "combo",
                              boxId: c.box_id ?? undefined,
                              comboId: c.id,
                              flavorIds: c.flavor_ids,
                              unitPrice: price,
                              name: c.name,
                            })
                          }
                          className={`mt-2 flex w-full items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-semibold uppercase tracking-wide transition active:scale-95 ${added === `combo:${c.id}` ? "bg-emerald-500 text-white" : "bg-gold text-navy-deep"}`}
                        >
                          {added === `combo:${c.id}` ? (
                            <>
                              <IconCheck width={12} height={12} /> Đã thêm
                            </>
                          ) : (
                            <>
                              <IconCart width={12} height={12} /> Thêm vào giỏ
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* MUA LẺ */}
        {tab === "la" && (
          <div className="grid grid-cols-2 gap-3">
            {retailFlavors.map((f) => (
              <article key={f.id} className="flex flex-col overflow-hidden rounded-card bg-white shadow-card">
                <ImageArea
                  badge={f.badge}
                  w={f.weight}
                  images={imagesOf(`flavor:${f.id}`)}
                  alt={f.name}
                  onOpen={(i) => setLightbox({ images: imagesOf(`flavor:${f.id}`), index: i, title: f.name })}
                />
                <div className="flex flex-1 flex-col p-3 text-center">
                  <h3 className="text-[13px] font-semibold leading-tight text-navy">{f.name}</h3>
                  <p className="mt-1 line-clamp-2 text-[10.5px] text-ink/55">{f.description}</p>
                  <div className="mt-auto pt-2">
                    <div className="price-lg text-[15px]">{formatMoney(flavorRetailPrice(f, region), region)}</div>
                    {f.premium && (
                      <div className="text-[9.5px] text-ink/45">+{formatMoney(flavorSurcharge(f, region), region)} trong hộp</div>
                    )}
                    <button
                      onClick={() =>
                        addToCart(`la:${f.id}`, {
                          kind: "la",
                          flavorIds: [f.id],
                          unitPrice: flavorRetailPrice(f, region),
                          name: f.name + " (lẻ)",
                        })
                      }
                      className={`mt-2 flex w-full items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-semibold uppercase tracking-wide transition active:scale-95 ${added === `la:${f.id}` ? "bg-emerald-500 text-white" : "bg-gold text-navy-deep"}`}
                    >
                      {added === `la:${f.id}` ? (
                        <>
                          <IconCheck width={12} height={12} /> Đã thêm
                        </>
                      ) : (
                        <>
                          <IconCart width={12} height={12} /> Thêm vào giỏ
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* sticky cta */}
      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-app items-center gap-2.5 border-t border-line bg-cream px-4 py-3">
        <a href="/tra-cuu" className="flex-1 text-[11px] font-medium uppercase tracking-wide text-navy/70">
          Tra cứu đơn
        </a>
        <a
          href="/dat-hang"
          className="relative flex items-center gap-1.5 rounded-full bg-gold px-5 py-3 text-xs font-semibold uppercase tracking-wide text-navy-deep"
        >
          <IconCart width={16} height={16} /> Tới giỏ
          {cartCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-navy px-1 text-[10px] font-bold text-cream">
              {cartCount}
            </span>
          )}
        </a>
      </div>

      {/* popup xem ảnh lớn — ngay trong trang, không rời trang */}
      {/* CHI TIẾT BỘ QUÀ TẶNG — ảnh lớn, quy cách, và từng loại nhân kèm đủ vị.
          Thẻ ngoài danh sách cố tình gọn (2 cột hẹp) nên mọi thông tin dài
          dòng dồn về đây. */}
      {detail && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50"
          onClick={() => setDetail(null)}
        >
          <div
            // max-h 86vh chứ không phải 92vh: chừa một dải nền thật ở trên đầu để
            // bấm ra ngoài đóng được, và ảnh không dính sát header trang.
            // overscroll-contain: cuộn hết popup thì DỪNG, không đẩy tiếp trang nền.
            className="max-h-[86vh] w-full max-w-app overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line bg-cream pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nút Đóng DÍNH ĐẦU POPUP.
                Trước đây nó nằm đè lên ảnh bên trong vùng cuộn, nên cuộn xuống
                xem nhân là nút trôi mất — đúng lỗi "nút X biến mất". Bọc trong
                một lớp sticky cao 0 để nút luôn thấy mà ảnh vẫn sát mép trên. */}
            <div className="sticky top-0 z-10 h-0">
              <button
                onClick={() => setDetail(null)}
                aria-label="Đóng"
                className="absolute left-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-[17px] leading-none text-white shadow-lg backdrop-blur"
              >
                ✕
              </button>
            </div>

            <div className="relative">
              <ImageArea
                badge={detail.badge}
                w={boxes.find((x) => x.id === detail.box_id)?.weight}
                images={imagesOf(`combo:${detail.id}`)}
                alt={detail.name}
                onOpen={(i) =>
                  setLightbox({ images: imagesOf(`combo:${detail.id}`), index: i, title: detail.name })
                }
              />
            </div>

            <div className="px-4 pt-4">
              {detail.category && <div className="eyebrow">{detail.category}</div>}
              <h3 className="title-heritage mt-0.5 text-xl">{detail.name}</h3>
              {detail.description && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink/70">{detail.description}</p>
              )}

              {(() => {
                const opts = comboOptions(detail, region);

                // Set cho khách TỰ CHỌN vị (§0025): danh sách vị được phép, mỗi
                // vị một nút − +, chọn đủ số bánh mới thêm được vào giỏ.
                const need = comboPickCount(detail);
                if (need) {
                  const pool = comboPickPool(detail, flavors);
                  const price = comboPrice(detail, boxes, flavors, region);
                  const chosen = pool.reduce((n, f) => n + (picks[f.id] ?? 0), 0);
                  const left = need - chosen;
                  const chose = pickedIds(pool);
                  const key = `combo:${detail.id}:pick`;
                  return (
                    <>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/50">
                          Chọn {need} vị
                        </div>
                        <div
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${left === 0 ? "bg-emerald-500/15 text-emerald-700" : "bg-gold/20 text-gold-deep"}`}
                        >
                          {chosen}/{need}
                        </div>
                      </div>
                      <p className="mt-1 text-[11.5px] text-ink/50">
                        Thích vị nào lấy vị đó, lấy trùng cũng được — chọn nào cũng cùng một giá.
                      </p>

                      <PickTray
                        slots={need}
                        filled={chose.map((id) => {
                          const f = pool.find((x) => x.id === id);
                          return {
                            id,
                            name: f?.name ?? "Vị",
                            img: imagesOf(`flavor:${id}`)[0],
                          };
                        })}
                        onRemove={(id) =>
                          setPicks((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) - 1) }))
                        }
                      />

                      <ul className="mt-3 space-y-2">
                        {pool.map((f) => (
                          <FlavorRow
                            key={f.id}
                            name={f.name}
                            img={imagesOf(`flavor:${f.id}`)[0]}
                            right={
                              <PickStepper
                                qty={picks[f.id] ?? 0}
                                canAdd={left > 0}
                                onChange={(d) =>
                                  setPicks((prev) => ({
                                    ...prev,
                                    [f.id]: Math.max(0, (prev[f.id] ?? 0) + d),
                                  }))
                                }
                              />
                            }
                          />
                        ))}
                      </ul>

                      {price !== null && (
                        // Dính đáy vùng cuộn: danh sách 6 vị dài hơn một màn
                        // điện thoại, không dính thì chọn xong phải cuộn ngược
                        // lên mới thấy nút.
                        <div className="sticky bottom-0 -mx-4 mt-5 border-t border-line bg-cream px-4 pb-1 pt-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="price-lg text-[17px]">
                              {formatMoney(price, region)}
                              <span className="unit"> / hộp</span>
                            </div>
                            <button
                              disabled={left !== 0}
                              onClick={() =>
                                addToCart(key, {
                                  kind: "combo",
                                  boxId: detail.box_id ?? undefined,
                                  comboId: detail.id,
                                  flavorIds: chose,
                                  flavorText: describePickedFlavors(chose, flavors),
                                  unitPrice: price,
                                  name: detail.name,
                                })
                              }
                              className={`flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wide transition active:scale-95 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink/40 ${added === key ? "bg-emerald-500 text-white" : "bg-gold text-navy-deep"}`}
                            >
                              {added === key ? (
                                <>
                                  <IconCheck width={13} height={13} /> Đã thêm
                                </>
                              ) : (
                                <>
                                  <IconCart width={13} height={13} /> Thêm vào giỏ
                                </>
                              )}
                            </button>
                          </div>
                          <p className="mt-1.5 min-h-[16px] text-[11px] text-ink/50">
                            {left > 0
                              ? `Còn thiếu ${left} bánh nữa.`
                              : describePickedFlavors(chose, flavors)}
                          </p>
                        </div>
                      )}
                    </>
                  );
                }

                // Set một giá (VD Sắc Đỏ): liệt kê thẳng các vị trong hộp.
                if (!opts.length) {
                  const price = comboPrice(detail, boxes, flavors, region);
                  // Danh sách này có sẵn id vị nên lấy ảnh thẳng, không phải dò tên.
                  const picked = detail.flavor_ids
                    .map((fid) => flavors.find((x) => x.id === fid))
                    .filter(Boolean) as Flavor[];
                  return (
                    <>
                      {picked.length > 0 && (
                        <div className="mt-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/50">
                            Gồm {picked.length} vị
                          </div>
                          <ul className="mt-2 space-y-2">
                            {picked.map((f) => (
                              <FlavorRow key={f.id} name={f.name} img={imagesOf(`flavor:${f.id}`)[0]} />
                            ))}
                          </ul>
                        </div>
                      )}
                      {price !== null && (
                        <div className="mt-5 flex items-center justify-between gap-3 rounded-card bg-white p-3.5 shadow-card">
                          <div className="price-lg text-[17px]">
                            {formatMoney(price, region)}
                            <span className="unit"> / hộp</span>
                          </div>
                          <button
                            onClick={() =>
                              addToCart(`combo:${detail.id}`, {
                                kind: "combo",
                                boxId: detail.box_id ?? undefined,
                                comboId: detail.id,
                                flavorIds: detail.flavor_ids,
                                unitPrice: price,
                                name: detail.name,
                              })
                            }
                            className={`flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wide transition active:scale-95 ${added === `combo:${detail.id}` ? "bg-emerald-500 text-white" : "bg-gold text-navy-deep"}`}
                          >
                            {added === `combo:${detail.id}` ? (
                              <>
                                <IconCheck width={13} height={13} /> Đã thêm
                              </>
                            ) : (
                              <>
                                <IconCart width={13} height={13} /> Thêm vào giỏ
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  );
                }

                // Set nhiều lựa chọn: mỗi loại nhân một khối, có đủ vị bên trong.
                return (
                  <div className="mt-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-navy/50">
                      Chọn loại nhân
                    </div>
                    <div className="mt-2 space-y-3">
                      {opts.map((o) => {
                        const key = `combo:${detail.id}:${o.name}`;
                        const vi = o.contents.split("·").map((x) => x.trim()).filter(Boolean);
                        return (
                          <div key={o.name} className="rounded-card bg-white p-3.5 shadow-card">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-[13.5px] font-semibold text-navy">{o.name}</span>
                              <span className="price-lg text-[15px]">{formatMoney(o.price, region)}</span>
                            </div>
                            {vi.length > 0 && (
                              <ul className="mt-2.5 space-y-2">
                                {vi.map((n) => (
                                  <FlavorRow
                                    key={n}
                                    name={n}
                                    // `contents` chỉ là chữ nên phải dò ngược ra vị mới có
                                    // ảnh. Dò trượt → `undefined` → ô giữ chỗ, tên vẫn còn.
                                    img={
                                      imagesOf(`flavor:${findFlavorByName(n, flavors)?.id ?? ""}`)[0]
                                    }
                                  />
                                ))}
                              </ul>
                            )}
                            <button
                              onClick={() =>
                                addToCart(key, {
                                  kind: "combo",
                                  boxId: detail.box_id ?? undefined,
                                  comboId: detail.id,
                                  variantName: o.name,
                                  flavorIds: detail.flavor_ids,
                                  unitPrice: o.price,
                                  name: `${detail.name} · ${o.name}`,
                                })
                              }
                              className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-[12px] font-semibold uppercase tracking-wide transition active:scale-95 ${added === key ? "bg-emerald-500 text-white" : "bg-gold text-navy-deep"}`}
                            >
                              {added === key ? (
                                <>
                                  <IconCheck width={13} height={13} /> Đã thêm
                                </>
                              ) : (
                                <>
                                  <IconCart width={13} height={13} /> Thêm vào giỏ
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          title={lightbox.title}
          onClose={() => setLightbox(null)}
        />
      )}
    </main>
  );
}
