"use client";

import { useState } from "react";
import type { Badge, Box, Combo, Flavor, Region } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { boxPrice, flavorRetailPrice, flavorSurcharge } from "@/lib/pricing";
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

function WeightChip({ w }: { w: number }) {
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

function ImageArea({ badge, w }: { badge?: Badge; w: number }) {
  return (
    <div className="relative flex h-40 items-center justify-center bg-cream-soft">
      <IconLotus width={54} height={54} className="text-gold/45" />
      <BadgeChip badge={badge} />
      <WeightChip w={w} />
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
  const [tab, setTab] = useState<Tab>("box");

  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream pb-24">
      <header className="bg-navy px-4 py-3.5 text-center">
        <a href="/" className="title-heritage text-base tracking-[0.18em] text-cream">
          Trăng Rằm
        </a>
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
        {(
          [
            ["box", "Hộp tự chọn", IconGrid],
            ["combo", "Combo", IconGift],
            ["la", "Mua lẻ", IconCart],
          ] as [Tab, string, typeof IconGrid][]
        ).map(([key, label, Icon]) => (
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
        {/* HỘP TỰ CHỌN */}
        {tab === "box" && (
          <div className="grid gap-4">
            {boxes.map((b) => (
              <article key={b.id} className="overflow-hidden rounded-card bg-white shadow-card">
                <ImageArea badge={b.badge} w={b.weight} />
                <div className="p-4 text-center">
                  <h3 className="font-semibold text-navy">{b.name}</h3>
                  {b.description && <p className="mx-auto mt-1 max-w-[280px] text-xs text-ink/60">{b.description}</p>}
                  <div className="mx-auto my-3 h-px w-16 bg-line" />
                  <Price v={region === "vn" ? b.price_vn : b.price_kr} region={region} />
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
        )}

        {/* COMBO */}
        {tab === "combo" && (
          <div className="grid gap-4">
            {combos.map((c) => {
              const b = boxes.find((x) => x.id === c.box_id) ?? boxes[0];
              const price = boxPrice(b, c.flavor_ids, flavors, region);
              return (
                <article key={c.id} className="overflow-hidden rounded-card bg-white shadow-card">
                  <ImageArea badge="best_seller" w={b.weight} />
                  <div className="p-4 text-center">
                    <h3 className="font-semibold text-navy">{c.name}</h3>
                    {c.description && <p className="mx-auto mt-1 max-w-[280px] text-xs text-ink/60">{c.description}</p>}
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                      {c.flavor_ids.map((fid) => {
                        const f = flavors.find((x) => x.id === fid);
                        if (!f) return null;
                        return (
                          <span key={fid} className={`rounded-full border px-2 py-0.5 text-[10px] ${f.premium ? "border-gold text-gold-deep" : "border-line text-ink/60"}`}>
                            {f.name}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mx-auto my-3 h-px w-16 bg-line" />
                    <Price v={price} region={region} />
                    <a
                      href={`/dat-hang?combo=${c.id}&region=${region}`}
                      className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-gold py-2.5 text-xs font-semibold uppercase tracking-wide text-navy-deep"
                    >
                      Thêm vào giỏ <IconArrowRight width={14} height={14} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* MUA LẺ */}
        {tab === "la" && (
          <div className="grid grid-cols-2 gap-3">
            {flavors.map((f) => (
              <article key={f.id} className="flex flex-col overflow-hidden rounded-card bg-white shadow-card">
                <div className="relative flex h-28 items-center justify-center bg-cream-soft">
                  <IconLotus width={40} height={40} className="text-gold/45" />
                  <BadgeChip badge={f.badge} />
                  <WeightChip w={f.weight} />
                </div>
                <div className="flex flex-1 flex-col p-3 text-center">
                  <h3 className="text-[13px] font-semibold leading-tight text-navy">{f.name}</h3>
                  <p className="mt-1 line-clamp-2 text-[10.5px] text-ink/55">{f.description}</p>
                  <div className="mt-auto pt-2">
                    <div className="price-lg text-[15px]">{formatMoney(flavorRetailPrice(f, region), region)}</div>
                    {f.premium && (
                      <div className="text-[9.5px] text-ink/45">+{formatMoney(flavorSurcharge(f, region), region)} trong hộp</div>
                    )}
                    <a
                      href={`/dat-hang?la=${f.id}&region=${region}`}
                      className="mt-2 block rounded-full bg-gold py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-deep"
                    >
                      Thêm
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* sticky cta */}
      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-app items-center gap-2.5 border-t border-line bg-cream px-4 py-3">
        <a href="/" className="flex-1 text-[11px] font-medium uppercase tracking-wide text-navy/70">
          ← Trang chủ
        </a>
        <a
          href="/dat-hang"
          className="flex items-center gap-1.5 rounded-full bg-gold px-5 py-3 text-xs font-semibold uppercase tracking-wide text-navy-deep"
        >
          <IconCart width={16} height={16} /> Tới giỏ
        </a>
      </div>
    </main>
  );
}
