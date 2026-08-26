"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_PRODUCT_IMAGES, type Badge, type Box, type Combo, type Flavor, type Region } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import {
  boxPrice,
  boxBasePrice,
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
import QuickOrderChat from "@/components/QuickOrderChat";
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

// ---------------------------------------------------------------- kiểu TikTok
// Mấy mảnh nhỏ học theo trang shop TikTok: giá đỏ đậm, giá cũ gạch ngang, chip
// "-N%" và "Freeship", hàng sản phẩm nằm ngang có nút Mua đỏ. Màu đỏ #E8264C
// pha trầm hơn đỏ TikTok gốc một chút cho hợp tông kem-vàng của trang.

/**
 * Giá cũ để gạch ngang, suy từ % giảm shop gõ ở Dashboard (ô "Giảm %").
 *
 * Giá BÁN THẬT vẫn là `price` — máy chủ chốt đơn không nhìn tới % giảm. Con số
 * gạch ngang chỉ là "giá trước khuyến mãi" để hiện: price = gốc × (1 − d) nên
 * gốc = price / (1 − d). Không đặt % giảm thì không có gì để gạch.
 */
function slashedPrice(price: number, discount?: number): number | null {
  const d = discount ?? 0;
  if (d <= 0 || d >= 100) return null;
  return Math.round(price / (1 - d / 100));
}

/** Khối giá kiểu TikTok: [-N%] 220.000đ  ~~320.000đ~~ */
function TikPrice({
  price,
  discount,
  region,
  big,
}: {
  price: number;
  discount?: number;
  region: Region;
  big?: boolean;
}) {
  const orig = slashedPrice(price, discount);
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      {orig !== null && (
        <span className="rounded bg-[#E8264C] px-1 py-[1px] text-[10px] font-bold leading-tight text-white">
          -{Math.round(discount!)}%
        </span>
      )}
      <span className={`font-bold text-[#E8264C] ${big ? "text-[21px]" : "text-[16px]"} leading-tight`}>
        {formatMoney(price, region)}
      </span>
      {orig !== null && (
        <span className="text-[11.5px] text-ink/40 line-through">{formatMoney(orig, region)}</span>
      )}
    </div>
  );
}

/** Chip Freeship / Giảm giá — hàng chip dưới tên sản phẩm. */
function TikChips({ freeship, discount }: { freeship: boolean; discount?: number }) {
  if (!freeship && !(discount && discount > 0)) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {discount != null && discount > 0 && (
        <span className="rounded border border-[#E8264C]/40 bg-[#E8264C]/5 px-1.5 py-[1px] text-[9.5px] font-semibold text-[#E8264C]">
          ⚡ Flash Sale
        </span>
      )}
      {freeship && (
        <span className="rounded border border-teal-500/40 bg-teal-500/5 px-1.5 py-[1px] text-[9.5px] font-semibold text-teal-600">
          🚚 Freeship
        </span>
      )}
    </div>
  );
}

/**
 * Một hàng sản phẩm kiểu danh sách TikTok Shop: ảnh vuông trái, phải là tên →
 * chip → giá đỏ + giá gạch → nút Mua đỏ góc dưới.
 *
 * Cả ba tab dùng chung một hàng này nên trang trên dưới đều một nhịp — khác
 * nhau mỗi nút hành động (Mua thẳng / mở màn chọn vị / sang trang tự chọn).
 */
function TikRow({
  img,
  name,
  desc,
  badge,
  price,
  discount,
  freeship,
  region,
  actionLabel,
  actionDone,
  onOpen,
  onAction,
  href,
}: {
  img?: string;
  name: string;
  desc?: string;
  badge?: Badge;
  price: number;
  discount?: number;
  freeship: boolean;
  region: Region;
  actionLabel: string;
  actionDone?: boolean;
  onOpen?: () => void;
  onAction?: () => void;
  href?: string;
}) {
  const btn = `rounded-lg px-4 py-1.5 text-[12px] font-semibold transition active:scale-95 ${actionDone ? "bg-emerald-500 text-white" : "bg-[#E8264C] text-white"}`;
  return (
    <article className="flex gap-3 rounded-card bg-white p-2.5 shadow-card">
      <button
        type="button"
        onClick={onOpen}
        className="relative h-[108px] w-[108px] flex-none overflow-hidden rounded-lg bg-cream-soft"
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-gold/50">
            <IconLotus width={34} height={34} />
          </span>
        )}
        {badge === "best_seller" && (
          <span className="absolute left-0 top-0 rounded-br-lg bg-gradient-to-r from-gold to-gold-deep px-1.5 py-0.5 text-[8.5px] font-bold uppercase text-white">
            Best seller
          </span>
        )}
        {badge === "must_try" && (
          <span className="absolute left-0 top-0 rounded-br-lg bg-navy px-1.5 py-0.5 text-[8.5px] font-bold uppercase text-cream">
            Must try
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <button type="button" onClick={onOpen} className="text-left">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-navy">{name}</h3>
        </button>
        {desc && <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink/45">{desc}</p>}
        <TikChips freeship={freeship} discount={discount} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <TikPrice price={price} discount={discount} region={region} />
          {href ? (
            <a href={href} className={btn}>
              {actionLabel}
            </a>
          ) : (
            <button type="button" onClick={onAction} className={btn}>
              {actionDone ? "✓ Đã thêm" : actionLabel}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Thanh sắp xếp: Đề xuất | Bán chạy | Giá ↕ — học theo dải lọc của TikTok. */
type SortKey = "rec" | "hot" | "priceAsc" | "priceDesc";
function SortBar({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const item = (on: boolean) =>
    `px-1 py-2 text-[12px] font-semibold transition ${on ? "text-[#E8264C]" : "text-ink/50"}`;
  const priceOn = sort === "priceAsc" || sort === "priceDesc";
  return (
    <div className="mb-3 flex items-center gap-4 border-b border-line/70 px-1">
      <button type="button" onClick={() => onChange("rec")} className={item(sort === "rec")}>
        Đề xuất
      </button>
      <button type="button" onClick={() => onChange("hot")} className={item(sort === "hot")}>
        Bán chạy
      </button>
      <button
        type="button"
        onClick={() => onChange(sort === "priceAsc" ? "priceDesc" : "priceAsc")}
        className={item(priceOn)}
      >
        Giá {sort === "priceAsc" ? "↑" : sort === "priceDesc" ? "↓" : "↕"}
      </button>
    </div>
  );
}

/**
 * Sắp danh sách theo thanh trên. "Bán chạy" xếp theo huy hiệu shop tự gắn
 * (best seller trước) — trang bán không có số lượt bán thật để mà xếp, và bịa
 * ra con số "đã bán" là nói dối khách.
 */
function sortRows<T>(rows: T[], sort: SortKey, price: (x: T) => number, badge: (x: T) => Badge | undefined): T[] {
  if (sort === "rec") return rows;
  const rank = (b?: Badge) => (b === "best_seller" ? 0 : b === "must_try" ? 1 : 2);
  return [...rows].sort((a, b) =>
    sort === "hot" ? rank(badge(a)) - rank(badge(b)) : sort === "priceAsc" ? price(a) - price(b) : price(b) - price(a),
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
  const [sort, setSort] = useState<SortKey>("rec");
  // Ô "đặt nhanh": khách dán tin nhắn, hệ thống đọc rồi điền sẵn trang đặt hàng.
  const [quickChat, setQuickChat] = useState(false);
  // Số hộp khách chỉnh trong popup chi tiết (kiểu ô "Số lượng" của TikTok).
  const [detailQty, setDetailQty] = useState(1);
  useEffect(() => setDetailQty(1), [detail?.id]);

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
  function addToCart(
    key: string,
    line: Omit<CartLine, "uid" | "qty" | "recipientUids">,
    qty = 1,
    buyNow = false,
  ) {
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
    if (same >= 0) cart[same] = { ...cart[same], qty: cart[same].qty + qty };
    else cart.push({ ...line, uid: nextUid(cart), qty, recipientUids: [] });

    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ ...blob, cart, buyerRegion: region }));
    } catch {
      /* ignore */
    }
    setCartCount(countCart(cart));
    setAdded(key);
    setTimeout(() => setAdded((k) => (k === key ? "" : k)), 1400);
    // "Mua ngay" kiểu TikTok: bỏ vào giỏ xong đi thẳng sang trang đặt hàng,
    // không bắt khách tự mò tới nút giỏ.
    if (buyNow) window.location.href = "/dat-hang";
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
          <>
            <SortBar sort={sort} onChange={setSort} />
            <div className="space-y-2.5">
              {sortRows(boxes, sort, (b) => boxBasePrice(b, region), (b) => b.badge).map((b) => (
                <TikRow
                  key={b.id}
                  img={imagesOf(`box:${b.id}`)[0]}
                  name={b.name}
                  desc={b.description}
                  badge={b.badge}
                  price={boxBasePrice(b, region)}
                  discount={b.discount}
                  freeship={!b.charge_ship}
                  region={region}
                  actionLabel="Tự chọn vị"
                  href={`/dat-hang?box=${b.id}&region=${region}&express=1`}
                  onOpen={() =>
                    imagesOf(`box:${b.id}`).length
                      ? setLightbox({ images: imagesOf(`box:${b.id}`), index: 0, title: b.name })
                      : undefined
                  }
                />
              ))}
            </div>
          </>
        )}

        {/* COMBO */}
        {tab === "combo" && (
          <>
            <SortBar sort={sort} onChange={setSort} />
            <div className="space-y-2.5">
              {sortRows(
                sellableCombos,
                sort,
                (c) => comboPrice(c, boxes, flavors, region) ?? 0,
                (c) => c.badge,
              ).map((c) => {
                const price = comboPrice(c, boxes, flavors, region);
                if (price === null) return null;
                const opts = comboOptions(c, region);
                const pick = comboPickCount(c);
                // Vị trong set — set tự chọn thì đó là danh sách được chọn.
                const flavorLine = c.flavor_ids
                  .map((fid) => flavors.find((x) => x.id === fid)?.name)
                  .filter(Boolean)
                  .join(" · ");
                const desc =
                  c.description || (pick ? `Chọn ${pick} trong: ${flavorLine}` : flavorLine);
                // Set cần chọn thêm (vị / loại nhân) thì nút Mua mở popup; set cố
                // định một giá thì Mua bỏ thẳng vào giỏ như TikTok.
                const needDetail = pick > 0 || opts.length > 0;
                const key = `combo:${c.id}`;
                return (
                  <TikRow
                    key={c.id}
                    img={imagesOf(key)[0]}
                    name={c.name}
                    desc={desc}
                    badge={c.badge}
                    price={price}
                    discount={c.discount}
                    freeship={!c.charge_ship}
                    region={region}
                    actionLabel={pick ? `Chọn ${pick} vị` : "Mua"}
                    actionDone={added === key}
                    onOpen={() => setDetail(c)}
                    onAction={() =>
                      needDetail
                        ? setDetail(c)
                        : addToCart(key, {
                            kind: "combo",
                            boxId: c.box_id ?? undefined,
                            comboId: c.id,
                            flavorIds: c.flavor_ids,
                            unitPrice: price,
                            name: c.name,
                          })
                    }
                  />
                );
              })}
            </div>
          </>
        )}

        {/* MUA LẺ */}
        {tab === "la" && (
          <>
            <SortBar sort={sort} onChange={setSort} />
            <div className="space-y-2.5">
              {sortRows(retailFlavors, sort, (f) => flavorRetailPrice(f, region), (f) => f.badge).map((f) => {
                const key = `la:${f.id}`;
                return (
                  <TikRow
                    key={f.id}
                    img={imagesOf(`flavor:${f.id}`)[0]}
                    name={`${f.name} (lẻ)`}
                    desc={f.description}
                    badge={f.badge}
                    price={flavorRetailPrice(f, region)}
                    discount={f.discount}
                    freeship={!f.charge_ship}
                    region={region}
                    actionLabel="Mua"
                    actionDone={added === key}
                    onOpen={() =>
                      imagesOf(`flavor:${f.id}`).length
                        ? setLightbox({ images: imagesOf(`flavor:${f.id}`), index: 0, title: f.name })
                        : undefined
                    }
                    onAction={() =>
                      addToCart(key, {
                        kind: "la",
                        flavorIds: [f.id],
                        unitPrice: flavorRetailPrice(f, region),
                        name: f.name + " (lẻ)",
                      })
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* sticky cta */}
      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-app items-center gap-2.5 border-t border-line bg-cream px-4 py-3">
        <a href="/tra-cuu" className="flex-1 text-[11px] font-medium uppercase tracking-wide text-navy/70">
          Tra cứu đơn
        </a>
        <button
          onClick={() => setQuickChat(true)}
          className="flex items-center gap-1 rounded-full border border-gold bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gold-deep transition active:scale-95"
        >
          ⚡ Đặt nhanh
        </button>
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
              <TikChips freeship={!detail.charge_ship} discount={detail.discount} />

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
                            <TikPrice price={price} discount={detail.discount} region={region} big />
                            <div className="flex items-center gap-1.5 text-[12px] text-ink/60">
                              Số lượng
                              <PickStepper
                                qty={detailQty}
                                canAdd
                                onChange={(d) => setDetailQty((q) => Math.max(1, q + d))}
                              />
                            </div>
                          </div>
                          <div className="mt-2 flex gap-2">
                            {(() => {
                              const line = {
                                kind: "combo" as const,
                                boxId: detail.box_id ?? undefined,
                                comboId: detail.id,
                                flavorIds: chose,
                                flavorText: describePickedFlavors(chose, flavors),
                                unitPrice: price,
                                name: detail.name,
                              };
                              const dis =
                                "disabled:cursor-not-allowed disabled:border-line disabled:bg-line disabled:text-ink/40";
                              return (
                                <>
                                  <button
                                    disabled={left !== 0}
                                    onClick={() => addToCart(key, line, detailQty)}
                                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border py-2.5 text-[12px] font-semibold uppercase tracking-wide transition active:scale-95 ${dis} ${added === key ? "border-emerald-500 bg-emerald-500 text-white" : "border-[#E8264C] bg-white text-[#E8264C]"}`}
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
                                  <button
                                    disabled={left !== 0}
                                    onClick={() => addToCart(key, line, detailQty, true)}
                                    className={`flex flex-1 flex-col items-center justify-center rounded-full bg-[#E8264C] py-1.5 text-[12px] font-bold uppercase tracking-wide text-white transition active:scale-95 ${dis}`}
                                  >
                                    Mua ngay
                                    <span className="text-[10px] font-medium normal-case opacity-90">
                                      {formatMoney(price * detailQty, region)}
                                      {!detail.charge_ship && " · Freeship"}
                                    </span>
                                  </button>
                                </>
                              );
                            })()}
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
                        <div className="mt-5 rounded-card bg-white p-3.5 shadow-card">
                          <div className="flex items-center justify-between gap-3">
                            <TikPrice price={price} discount={detail.discount} region={region} big />
                            <div className="flex items-center gap-1.5 text-[12px] text-ink/60">
                              Số lượng
                              <PickStepper
                                qty={detailQty}
                                canAdd
                                onChange={(d) => setDetailQty((q) => Math.max(1, q + d))}
                              />
                            </div>
                          </div>
                          <div className="mt-2.5 flex gap-2">
                            {(() => {
                              const key2 = `combo:${detail.id}`;
                              const line = {
                                kind: "combo" as const,
                                boxId: detail.box_id ?? undefined,
                                comboId: detail.id,
                                flavorIds: detail.flavor_ids,
                                unitPrice: price,
                                name: detail.name,
                              };
                              return (
                                <>
                                  <button
                                    onClick={() => addToCart(key2, line, detailQty)}
                                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border py-2.5 text-[12px] font-semibold uppercase tracking-wide transition active:scale-95 ${added === key2 ? "border-emerald-500 bg-emerald-500 text-white" : "border-[#E8264C] bg-white text-[#E8264C]"}`}
                                  >
                                    {added === key2 ? (
                                      <>
                                        <IconCheck width={13} height={13} /> Đã thêm
                                      </>
                                    ) : (
                                      <>
                                        <IconCart width={13} height={13} /> Thêm vào giỏ
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => addToCart(key2, line, detailQty, true)}
                                    className="flex flex-1 flex-col items-center justify-center rounded-full bg-[#E8264C] py-1.5 text-[12px] font-bold uppercase tracking-wide text-white transition active:scale-95"
                                  >
                                    Mua ngay
                                    <span className="text-[10px] font-medium normal-case opacity-90">
                                      {formatMoney(price * detailQty, region)}
                                      {!detail.charge_ship && " · Freeship"}
                                    </span>
                                  </button>
                                </>
                              );
                            })()}
                          </div>
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

      {quickChat && (
        <QuickOrderChat
          boxes={boxes}
          flavors={flavors}
          combos={combos}
          region={region}
          onClose={() => setQuickChat(false)}
        />
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
