"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Badge, Box, Combo, Flavor, Region } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { boxPrice, flavorRetailPrice, flavorSurcharge, type CartLine, comboPrice, comboOptions } from "@/lib/pricing";
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
const MAX_IMAGES = 4; // khớp giới hạn ảnh ở Dashboard
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

/** Khung ảnh 4:5 — lướt qua tối đa 4 ảnh, bấm vào mở popup xem lớn. */
function ImageArea({
  badge,
  w,
  images = [],
  alt = "",
  onOpen,
}: {
  badge?: Badge;
  w?: number;
  images?: string[];
  alt?: string;
  onOpen?: (i: number) => void;
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
      const list = (images ?? []).filter(Boolean).slice(0, MAX_IMAGES);
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
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; title: string } | null>(null);
  const imagesOf = (key: string) => imgsByKey[key] ?? [];

  useEffect(() => {
    setCartCount(countCart(readCart().cart));
  }, []);

  /** Thêm vào giỏ ngay tại trang: trùng món thì cộng dồn số lượng, không chuyển trang. */
  function addToCart(key: string, line: Omit<CartLine, "uid" | "qty" | "recipientUids">) {
    const blob = readCart();
    const cart = [...(blob.cart ?? [])];
    const same = cart.findIndex(
      (l) =>
        l.kind === line.kind &&
        l.comboId === line.comboId &&
        l.variantName === line.variantName &&
        l.flavorIds?.[0] === line.flavorIds?.[0],
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
              // card 2 cột hẹp → gộp tên vị thành 1 dòng thay vì chip rời
              const flavorLine = c.flavor_ids
                .map((fid) => flavors.find((x) => x.id === fid)?.name)
                .filter(Boolean)
                .join(" · ");
              return (
                <article key={c.id} className="flex flex-col overflow-hidden rounded-card bg-white shadow-card">
                  <ImageArea
                    badge="best_seller"
                    w={b?.weight}
                    images={imagesOf(`combo:${c.id}`)}
                    alt={c.name}
                    onOpen={(i) => setLightbox({ images: imagesOf(`combo:${c.id}`), index: i, title: c.name })}
                  />
                  <div className="flex flex-1 flex-col p-3 text-center">
                    <h3 className="text-[13px] font-semibold leading-tight text-navy">{c.name}</h3>
                    {(c.description || flavorLine) && (
                      <p className="mt-1 line-clamp-2 text-[10.5px] text-ink/55">{c.description || flavorLine}</p>
                    )}
                    <div className="mt-auto pt-2">
                      <div className="price-lg text-[15px]">
                        {opts.length > 1 && <span className="unit">từ </span>}
                        {formatMoney(price, region)}
                        <span className="unit"> / hộp</span>
                      </div>

                      {opts.length ? (
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
                                    boxId: c.box_id,
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
                              boxId: c.box_id,
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
