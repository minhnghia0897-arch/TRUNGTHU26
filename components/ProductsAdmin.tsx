"use client";

import { useEffect, useRef, useState } from "react";
import type { Box, Flavor, Combo } from "@/lib/types";
import { boxPrice } from "@/lib/pricing";
import { IconXCircle, IconShirt, IconGift, IconCart } from "@/components/icons";

const EDITS_KEY = "tr_product_edits";
const NEW_KEY = "tr_product_new";

type InvItem = { name: string; qty: number; status: "ok" | "low" | "out" };

interface Override {
  name?: string;
  image?: string; // legacy 1 ảnh
  images?: string[]; // tối đa 4 ảnh
  cost?: number;
  priceVn?: number;
  priceKr?: number;
  discount?: number; // %
  stock?: string; // tên mặt hàng kho
  active?: boolean;
  flavorIds?: string[]; // bánh trong set (Hộp/Combo)
}

interface Product {
  key: string;
  type: "Hộp" | "Combo" | "Vị";
  premium?: boolean;
  name: string;
  priceVn: number;
  priceKr: number;
  cost: number;
  discount: number;
  images: string[];
  stock?: string;
  active: boolean;
  flavorIds?: string[]; // bánh trong set
}

const krw = (v: number) => "₩" + Math.round(v).toLocaleString("en-US");
const vnd = (v: number) => Math.round(v).toLocaleString("vi-VN") + "đ";

export default function ProductsAdmin({
  boxes,
  flavors,
  combos,
  inventory,
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  inventory: InvItem[];
}) {
  const [ov, setOv] = useState<Record<string, Override>>({});
  const [custom, setCustom] = useState<Product[]>([]);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [chooser, setChooser] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EDITS_KEY);
      if (raw) setOv(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    try {
      const rawNew = localStorage.getItem(NEW_KEY);
      if (rawNew) setCustom(JSON.parse(rawNew));
    } catch {
      /* ignore */
    }
  }, []);

  // sản phẩm gốc từ catalog
  const base: Omit<Product, "images">[] = [
    ...boxes.map((b) => ({
      key: `box:${b.id}`, type: "Hộp" as const, name: b.name,
      priceVn: b.price_vn, priceKr: b.price_kr, cost: 0, discount: 0, active: b.active,
      flavorIds: [] as string[],
    })),
    ...combos.map((c) => {
      const bx = boxes.find((x) => x.id === c.box_id) ?? boxes[0];
      return {
        key: `combo:${c.id}`, type: "Combo" as const, name: c.name,
        priceVn: boxPrice(bx, c.flavor_ids, flavors, "vn"),
        priceKr: boxPrice(bx, c.flavor_ids, flavors, "kr"),
        cost: 0, discount: 0, active: c.active, flavorIds: c.flavor_ids,
      };
    }),
    ...flavors.map((f) => ({
      key: `flavor:${f.id}`, type: "Vị" as const, premium: f.premium, name: f.name,
      priceVn: f.price_vn, priceKr: f.price_kr, cost: 0, discount: 0, active: f.active,
    })),
  ];

  const mergedBase: Product[] = base.map((p) => {
    const o = ov[p.key] ?? {};
    const images = o.images ?? (o.image ? [o.image] : []);
    return {
      ...p,
      images,
      name: o.name ?? p.name,
      priceVn: o.priceVn ?? p.priceVn,
      priceKr: o.priceKr ?? p.priceKr,
      cost: o.cost ?? p.cost,
      discount: o.discount ?? p.discount,
      stock: o.stock ?? p.stock,
      active: o.active ?? p.active,
      flavorIds: o.flavorIds ?? p.flavorIds,
    };
  });
  // sản phẩm tự thêm hiển thị trên cùng
  const merged: Product[] = [...custom, ...mergedBase];

  const save = (key: string, patch: Override) => {
    setOv((cur) => {
      const next = { ...cur, [key]: { ...(cur[key] ?? {}), ...patch } };
      try {
        localStorage.setItem(EDITS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const persistCustom = (next: Product[]) => {
    setCustom(next);
    try {
      localStorage.setItem(NEW_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // gộp Override vào một Product đầy đủ (dùng cho sản phẩm tự thêm)
  const applyOverride = (p: Product, o: Override): Product => ({
    ...p,
    name: o.name ?? p.name,
    images: o.images ?? (o.image ? [o.image] : p.images),
    cost: o.cost ?? p.cost,
    priceVn: o.priceVn ?? p.priceVn,
    priceKr: o.priceKr ?? p.priceKr,
    discount: o.discount ?? p.discount,
    stock: o.stock,
    active: o.active ?? p.active,
    flavorIds: o.flavorIds ?? p.flavorIds,
  });

  const newProduct = (type: Product["type"]): Product => ({
    key: `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type,
    name: type === "Hộp" ? "Hộp mới" : type === "Combo" ? "Combo mới" : "Vị mới",
    priceVn: 0, priceKr: 0, cost: 0, discount: 0,
    images: [], active: true, flavorIds: [],
  });

  const handleSave = (patch: Override) => {
    if (draft) {
      persistCustom([applyOverride(draft, patch), ...custom]);
      setDraft(null);
    } else if (editKey?.startsWith("custom:")) {
      persistCustom(custom.map((c) => (c.key === editKey ? applyOverride(c, patch) : c)));
      setEditKey(null);
    } else if (editKey) {
      save(editKey, patch);
      setEditKey(null);
    }
  };

  const deleteCustom = (key: string) => {
    persistCustom(custom.filter((c) => c.key !== key));
    setEditKey(null);
  };

  const editing = draft ?? (editKey ? merged.find((p) => p.key === editKey) ?? null : null);
  const afterDiscount = (price: number, disc: number) => Math.round(price * (1 - disc / 100));

  const TypeIcon = ({ t }: { t: Product["type"] }) =>
    t === "Hộp" ? <IconShirt width={15} height={15} /> : t === "Combo" ? <IconGift width={15} height={15} /> : <IconCart width={15} height={15} />;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <h1 className="text-[15px] font-semibold text-slate-800">Sản phẩm</h1>
        <span className="text-[13px] text-slate-400">{merged.length} mục</span>
        <button
          onClick={() => setChooser(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
        >
          + Thêm sản phẩm
        </button>
        <a href="/san-pham" className="text-[13px] font-medium text-blue-600 hover:underline">Xem trang bán →</a>
      </header>

      <div className="p-5">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Ảnh</th>
                <th className="px-4 py-2.5">Tên</th>
                <th className="px-4 py-2.5">Loại</th>
                <th className="px-4 py-2.5 text-right">Giá vốn</th>
                <th className="px-4 py-2.5 text-right">Giá bán (Hàn)</th>
                <th className="px-4 py-2.5 text-right">Giảm</th>
                <th className="px-4 py-2.5 text-right">Sau giảm</th>
                <th className="px-4 py-2.5">Kho</th>
                <th className="px-4 py-2.5 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {merged.map((p) => {
                const inv = inventory.find((i) => i.name === p.stock);
                return (
                  <tr key={p.key} className="cursor-pointer hover:bg-slate-50" onClick={() => setEditKey(p.key)}>
                    <td className="px-4 py-2">
                      <div className="relative">
                        {p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0]} alt="" className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-lg bg-cream-soft text-gold/50"><TypeIcon t={p.type} /></div>
                        )}
                        {p.images.length > 1 && (
                          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-slate-800 px-1 text-[9px] font-medium text-white">
                            {p.images.length}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {p.type}{p.premium ? " · Premium" : ""}
                      {p.key.startsWith("custom:") && <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Tự thêm</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{p.cost ? krw(p.cost) : "—"}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{krw(p.priceKr)}</td>
                    <td className="px-4 py-2 text-right">{p.discount ? <span className="text-rose-600">-{p.discount}%</span> : "—"}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-800">{krw(afterDiscount(p.priceKr, p.discount))}</td>
                    <td className="px-4 py-2">
                      {p.stock ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-slate-600">{p.stock}</span>
                          {inv && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${inv.status === "ok" ? "bg-emerald-100 text-emerald-700" : inv.status === "low" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                              {inv.qty}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-300">Chưa liên kết</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${p.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.active ? "Đang bán" : "Ẩn"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-slate-400">Bấm vào một sản phẩm để sửa. Thay đổi lưu tạm ở trình duyệt (demo) — bản thật ghi vào Supabase.</p>
      </div>

      {chooser && (
        <TypeChooser
          onPick={(t) => { setChooser(false); setDraft(newProduct(t)); }}
          onClose={() => setChooser(false)}
        />
      )}

      {editing && (
        <EditModal
          product={editing}
          create={!!draft}
          flavors={flavors}
          inventory={inventory}
          onSave={handleSave}
          onDelete={editing.key.startsWith("custom:") && !draft ? () => deleteCustom(editing.key) : undefined}
          onClose={() => { setDraft(null); setEditKey(null); }}
        />
      )}
    </main>
  );
}

function TypeChooser({ onPick, onClose }: { onPick: (t: Product["type"]) => void; onClose: () => void }) {
  const opts: { t: Product["type"]; icon: React.ReactNode; desc: string }[] = [
    { t: "Hộp", icon: <IconShirt width={20} height={20} />, desc: "Vỏ hộp + chọn bánh cho vào set" },
    { t: "Combo", icon: <IconGift width={20} height={20} />, desc: "Gộp nhiều bánh thành combo" },
    { t: "Vị", icon: <IconCart width={20} height={20} />, desc: "Một vị bánh bán lẻ" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-16 w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <h3 className="text-[15px] font-semibold text-slate-800">Thêm sản phẩm — chọn loại</h3>
          <button onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
            <IconXCircle width={20} height={20} />
          </button>
        </div>
        <div className="space-y-2 p-5">
          {opts.map((o) => (
            <button
              key={o.t}
              onClick={() => onPick(o.t)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50/40"
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-slate-100 text-slate-600">{o.icon}</span>
              <span>
                <span className="block text-[14px] font-semibold text-slate-800">{o.t}</span>
                <span className="block text-[12px] text-slate-400">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditModal({
  product,
  create,
  flavors,
  inventory,
  onSave,
  onDelete,
  onClose,
}: {
  product: Product;
  create?: boolean;
  flavors: Flavor[];
  inventory: InvItem[];
  onSave: (patch: Override) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [images, setImages] = useState<string[]>(product.images ?? []);
  const [url, setUrl] = useState("");
  const [cost, setCost] = useState(product.cost);
  const [priceVn, setPriceVn] = useState(product.priceVn);
  const [priceKr, setPriceKr] = useState(product.priceKr);
  const [discount, setDiscount] = useState(product.discount);
  const [stock, setStock] = useState(product.stock ?? "");
  const [active, setActive] = useState(product.active);
  const [flavorIds, setFlavorIds] = useState<string[]>(product.flavorIds ?? []);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasSet = product.type === "Hộp" || product.type === "Combo";
  const MAX = 4;

  const pickFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).slice(0, MAX).forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => setImages((cur) => (cur.length >= MAX ? cur : [...cur, String(rd.result)]));
      rd.readAsDataURL(f);
    });
  };
  const addUrl = () => {
    const u = url.trim();
    if (u && images.length < MAX) {
      setImages((cur) => [...cur, u]);
      setUrl("");
    }
  };
  const removeImg = (i: number) => setImages((cur) => cur.filter((_, j) => j !== i));
  const toggleFlavor = (id: string) =>
    setFlavorIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = () =>
    onSave({ name, images, image: images[0] || undefined, cost, priceVn, priceKr, discount, stock: stock || undefined, active, flavorIds: hasSet ? flavorIds : undefined });

  const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <h3 className="text-[15px] font-semibold text-slate-800">{create ? "Thêm sản phẩm" : "Sửa sản phẩm"}</h3>
          <span className="text-[12px] text-slate-400">· {product.type}</span>
          <button onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
            <IconXCircle width={20} height={20} />
          </button>
        </div>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-5">
          {/* ảnh — tối đa 4 */}
          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Ảnh sản phẩm ({images.length}/{MAX})</span>
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <div key={i} className="relative h-16 w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                  <button
                    onClick={() => removeImg(i)}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[11px] text-white shadow"
                  >
                    ×
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-0 left-0 rounded-br rounded-tl bg-slate-800/80 px-1 text-[8px] text-white">Ảnh bìa</span>
                  )}
                </div>
              ))}
              {images.length < MAX && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="grid h-16 w-16 place-items-center rounded-lg border-2 border-dashed border-slate-300 text-[11px] text-slate-400 hover:border-blue-400 hover:text-blue-500"
                >
                  + Ảnh
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />
            {images.length < MAX && (
              <div className="mt-2 flex gap-2">
                <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} placeholder="hoặc dán URL ảnh rồi Enter" className={inp} />
                <button onClick={addUrl} className="flex-none rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50">Thêm</button>
              </div>
            )}
          </div>

          <L label="Tên sản phẩm"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></L>

          <div className="grid grid-cols-2 gap-3">
            <L label="Giá vốn (₩)"><Num value={cost} onChange={setCost} /></L>
            <L label="Giảm giá (%)"><Num value={discount} onChange={setDiscount} /></L>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L label="Giá bán VN (đ)"><Num value={priceVn} onChange={setPriceVn} /></L>
            <L label="Giá bán Hàn (₩)"><Num value={priceKr} onChange={setPriceKr} /></L>
          </div>

          {/* preview giá + lợi nhuận */}
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            Giá sau giảm: <b className="text-slate-800">{krw(Math.round(priceKr * (1 - discount / 100)))}</b> ·{" "}
            {vnd(Math.round(priceVn * (1 - discount / 100)))}
            {cost > 0 && (
              <> · Lợi nhuận ≈ <b className={priceKr * (1 - discount / 100) - cost >= 0 ? "text-emerald-600" : "text-rose-600"}>{krw(priceKr * (1 - discount / 100) - cost)}</b></>
            )}
          </div>

          {/* liên kết kho */}
          <L label="Liên kết kho hàng">
            <select value={stock} onChange={(e) => setStock(e.target.value)} className={inp}>
              <option value="">— Không liên kết —</option>
              {inventory.map((i) => (
                <option key={i.name} value={i.name}>{i.name} (tồn {i.qty})</option>
              ))}
            </select>
          </L>

          {/* biến thể: bánh cho vào set (Hộp / Combo) */}
          {hasSet && (
            <L label={`Bánh cho vào set — biến thể (${flavorIds.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {flavors.map((f) => {
                  const on = flavorIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFlavor(f.id)}
                      className={`rounded-full border px-2.5 py-1 text-[12px] ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"} ${f.premium ? (on ? "" : "border-gold text-gold-deep") : ""}`}
                    >
                      {on ? "✓ " : "+ "}{f.name}{f.premium ? " ★" : ""}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">Chọn các vị bánh được phép cho vào set này.</p>
            </L>
          )}

          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-blue-600" />
            Đang bán
          </label>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
          {onDelete && (
            <button onClick={onDelete} className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50">Xoá</button>
          )}
          <button onClick={onClose} className="ml-auto rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Huỷ</button>
          <button onClick={submit} className="rounded-lg bg-blue-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-blue-700">{create ? "Tạo sản phẩm" : "Lưu"}</button>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400"
    />
  );
}
