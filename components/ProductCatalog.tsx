"use client";

import { useState } from "react";
import type { Box, Combo, Flavor, Region } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { boxPrice, flavorRetailPrice, flavorSurcharge } from "@/lib/pricing";

type Tab = "box" | "combo" | "la";

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
  const fmt = (v: number) => formatMoney(v, region);

  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream pb-24 shadow-2xl">
      {/* header */}
      <header className="bg-maroon-deep px-4 py-3.5 text-center">
        <a href="/" className="title-heritage text-base tracking-[0.18em] text-cream">Trăng Rằm</a>
      </header>

      <div className="px-4 pt-4 text-center">
        <div className="eyebrow">Ba cách chọn quà</div>
        <h1 className="title-heritage mt-1 text-xl">Sản phẩm</h1>
      </div>

      {/* region */}
      <div className="flex justify-center gap-2 px-4 py-3 text-[11px]">
        {(["kr", "vn"] as Region[]).map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={`rounded border px-3 py-2 font-serif uppercase tracking-wide ${region === r ? "border-maroon bg-maroon text-cream" : "border-line bg-white text-maroon"}`}
          >
            {r === "kr" ? "🇰🇷 Đặt ở Hàn · ₩" : "🇻🇳 Đặt ở VN · đ"}
          </button>
        ))}
      </div>

      {/* tabs */}
      <div className="sticky top-0 z-10 flex border-b border-line bg-cream px-4">
        {([
          ["box", "Hộp tự chọn"],
          ["combo", "Combo / Set"],
          ["la", "Mua lẻ"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 border-b-2 py-2.5 font-serif text-[11px] uppercase tracking-wide ${tab === key ? "border-gold text-maroon" : "border-transparent text-maroon/50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 py-5">
        {/* HỘP TỰ CHỌN */}
        {tab === "box" && (
          <div className="grid gap-4">
            {boxes.map((b) => (
              <article key={b.id} className="overflow-hidden rounded border border-line bg-white">
                <div className="flex h-28 items-center justify-center bg-[linear-gradient(135deg,#7a2230,#4a121b)] font-serif text-4xl text-cream/80">
                  ❋
                </div>
                <div className="p-4">
                  <h3 className="font-serif text-sm font-semibold uppercase tracking-wide text-maroon">{b.name}</h3>
                  {b.description && <p className="mt-1 text-xs opacity-70">{b.description}</p>}
                  <ul className="mt-2 space-y-0.5 text-[11px] opacity-70">
                    <li>· {b.slots} ô · bánh {b.weight}g</li>
                    {Object.entries(b.specs ?? {}).map(([k, v]) => (
                      <li key={k}>· {String(v)}</li>
                    ))}
                    <li>· Giá phẳng theo hộp + phụ thu vị premium</li>
                  </ul>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-serif text-base font-semibold text-maroon-deep">
                      {fmt(region === "vn" ? b.price_vn : b.price_kr)}
                    </span>
                    <a
                      href={`/dat-hang?box=${b.id}`}
                      className="rounded bg-gold px-3.5 py-2 font-serif text-xs font-semibold uppercase tracking-wide text-maroon-deep"
                    >
                      Tự chọn vị
                    </a>
                  </div>
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
                <article key={c.id} className="overflow-hidden rounded border border-line bg-white">
                  <div className="flex h-28 items-center justify-center bg-[linear-gradient(135deg,#7a2230,#4a121b)] font-serif text-4xl text-cream/80">
                    ✦
                  </div>
                  <div className="p-4">
                    <h3 className="font-serif text-sm font-semibold uppercase tracking-wide text-maroon">{c.name}</h3>
                    {c.description && <p className="mt-1 text-xs opacity-70">{c.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.flavor_ids.map((fid) => {
                        const f = flavors.find((x) => x.id === fid);
                        if (!f) return null;
                        return (
                          <span key={fid} className={`rounded-full border px-2 py-1 text-[10px] ${f.premium ? "border-gold text-maroon" : "border-line opacity-80"}`}>
                            {f.name}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-serif text-base font-semibold text-maroon-deep">{fmt(price)}</span>
                      <a
                        href={`/dat-hang?combo=${c.id}`}
                        className="rounded bg-gold px-3.5 py-2 font-serif text-xs font-semibold uppercase tracking-wide text-maroon-deep"
                      >
                        Thêm vào giỏ
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* MUA LẺ */}
        {tab === "la" && (
          <div className="grid gap-3">
            {flavors.map((f) => (
              <article key={f.id} className="rounded border border-line bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-[13px] font-semibold uppercase tracking-wide text-maroon">
                      {f.name}
                      {f.premium && (
                        <span className="ml-2 rounded-sm border border-gold px-1.5 py-0.5 text-[9px] text-gold">Premium</span>
                      )}
                    </h3>
                    {f.description && <p className="mt-1 text-xs opacity-70">{f.description}</p>}
                    <div className="mt-1 text-[11px] opacity-60">
                      Bánh {f.weight}g
                      {f.premium && ` · phụ thu trong hộp +${fmt(flavorSurcharge(f, region))}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-serif font-semibold text-maroon-deep">
                      {fmt(flavorRetailPrice(f, region))}
                    </div>
                    <a
                      href={`/dat-hang?la=${f.id}`}
                      className="mt-1.5 inline-block rounded bg-gold px-3 py-1.5 font-serif text-[11px] font-semibold uppercase tracking-wide text-maroon-deep"
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
        <a href="/" className="flex-1 text-[11px] uppercase tracking-wide text-maroon opacity-70">
          ← Trang chủ
        </a>
        <a
          href="/dat-hang"
          className="rounded bg-gold px-5 py-3 font-serif text-xs font-semibold uppercase tracking-widest text-maroon-deep"
        >
          Tới giỏ hàng
        </a>
      </div>
    </main>
  );
}
