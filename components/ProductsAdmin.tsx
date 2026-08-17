"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PRODUCT_IMAGES, type Box, type Flavor, type Combo, type Warehouse } from "@/lib/types";
import ShippingSettings from "./ShippingSettings";
import BankQrSettings from "./BankQrSettings";
import { boxPrice, comboPrice } from "@/lib/pricing";
import { shrinkImage } from "@/lib/products/imageResize";
import { IconXCircle, IconShirt, IconGift, IconCart } from "@/components/icons";

const API_PRODUCTS = "/api/dashboard/products";
const API_UPLOAD = "/api/dashboard/upload";
const API_CONVERT = "/api/dashboard/products/convert";

/**
 * Đọc trả lời của API mà KHÔNG tin chắc đó là JSON.
 *
 * `res.json()` trần đã ném ra tận màn hình câu:
 *   Unexpected token 'R', "Request En"... is not valid JSON
 * Đó là hạ tầng Vercel trả chuỗi chữ "Request Entity Too Large" (413) khi ảnh
 * gửi lên quá 4.5MB — chưa vào tới code của mình. Session hết hạn cũng vậy:
 * middleware trả về HTML đăng nhập, parse JSON là vỡ y hệt.
 *
 * Lỗi của máy chủ phải đọc ra thành câu người hiểu được, không phải câu của
 * trình phân tích cú pháp.
 */
async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413)
      throw new Error("Ảnh quá nặng so với giới hạn máy chủ. Chọn ảnh nhỏ hơn rồi thử lại.");
    if (res.status === 401) throw new Error("Phiên đăng nhập đã hết. Đăng nhập lại rồi thử lại.");
    throw new Error(`${fallback} (máy chủ trả lỗi ${res.status}).`);
  }
}

// mặt hàng kho — liên kết theo KEY (mã SKU), tên hiển thị lấy live từ kho
// map tên gốc → key (để nâng cấp các liên kết cũ lưu theo tên)

// Mẫu mã (thuộc tính) — mỗi lựa chọn là 1 tổ hợp bánh của cùng một sản phẩm.
// VD Vinh Hiển có "Nhân đặc biệt" 55.000₩ và "Nhân cổ truyền cao cấp" 60.000₩.
interface Variant {
  name: string; // Nhân đặc biệt, Nhân cổ truyền…
  contents: string; // "matcha · thập cẩm · đậu xanh…"
  /** Giá của riêng lựa chọn này. Để trống = dùng giá chung của sản phẩm. */
  price_vn?: number | null;
  price_kr?: number | null;
}

interface Override {
  name?: string;
  code?: string; // Mã SP
  category?: string; // Danh mục
  image?: string; // legacy 1 ảnh
  images?: string[]; // tối đa MAX_PRODUCT_IMAGES ảnh
  cost?: number;
  priceVn?: number;
  priceKr?: number;
  discount?: number; // %
  stock?: string; // legacy: tên mặt hàng kho (chỉ còn để lọc bỏ khi gửi lên)
  stockQty?: number; // tồn kho của chính sản phẩm
  allowNegative?: boolean; // cho phép bán tồn kho âm
  chargeShip?: boolean; // thu phí ship riêng cho món này
  note?: string; // ghi chú nội bộ
  supplyLink?: string; // link nhập hàng
  variants?: Variant[]; // mẫu mã
  active?: boolean;
  flavorIds?: string[]; // bánh cho vào set (Hộp/Combo)
  removed?: boolean; // đã xoá (ẩn khỏi danh sách, còn khôi phục được)
}

interface Product {
  key: string;
  type: "Hộp" | "Combo" | "Vị";
  premium?: boolean;
  name: string;
  code?: string;
  category?: string;
  priceVn: number;
  priceKr: number;
  cost: number;
  discount: number;
  images: string[];
  stockQty: number; // tồn kho của chính sản phẩm
  allowNegative?: boolean;
  chargeShip?: boolean;
  note?: string;
  supplyLink?: string;
  variants?: Variant[];
  active: boolean;
  flavorIds?: string[];
}

/** Override (kiểu của màn hình) → thân yêu cầu API. Bỏ 2 trường cũ image/stock. */
function toPatch(o: Override) {
  const { image: _image, stock: _stock, stockQty, ...rest } = o;
  void _image;
  void _stock;
  // Màn hình gọi là stockQty (khỏi lẫn với trường legacy `stock` kiểu chuỗi),
  // API gọi là stock — đổi tên đúng một chỗ này.
  return stockQty === undefined ? rest : { ...rest, stock: stockQty };
}

const krw = (v: number) => "₩" + Math.round(v).toLocaleString("en-US");
const vnd = (v: number) => Math.round(v).toLocaleString("vi-VN") + "đ";

export default function ProductsAdmin({
  boxes,
  flavors,
  combos,
  warehouses,
  connected = false,
  bankQrVn = "",
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  warehouses: Warehouse[];
  /** Đã nối cơ sở dữ liệu chưa. Chưa nối thì mọi thay đổi không lưu được. */
  connected?: boolean;
  /** Ảnh QR ngân hàng VN đang dùng ở trang thanh toán. */
  bankQrVn?: string;
}) {
  const router = useRouter();
  // Lớp phủ tạm để màn hình phản hồi ngay khi bấm lưu; nguồn thật là database,
  // lưu xong gọi router.refresh() để đọc lại.
  const [ov, setOv] = useState<Record<string, Override>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [chooser, setChooser] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  // sản phẩm gốc từ catalog
  // Nạp đủ các trường mà form có sửa. Thiếu bất kỳ trường nào ở đây là mở sản
  // phẩm ra rồi bấm Lưu sẽ GHI RỖNG ĐÈ LÊN dữ liệu thật — mất ảnh, mất mẫu mã.
  const common = (r: Box | Flavor | Combo) => ({
    code: r.code,
    category: r.category,
    cost: r.cost ?? 0,
    discount: r.discount ?? 0,
    note: r.note,
    supplyLink: r.supply_link,
    stockQty: r.stock ?? 0,
    allowNegative: r.allow_negative,
    chargeShip: r.charge_ship,
    variants: r.variants,
    dbImages: r.images ?? [],
  });

  const base: (Omit<Product, "images"> & { dbImages: string[] })[] = [
    ...boxes.map((b) => ({
      key: `box:${b.id}`, type: "Hộp" as const, name: b.name,
      priceVn: b.price_vn, priceKr: b.price_kr, active: b.active,
      flavorIds: [] as string[],
      ...common(b),
    })),
    ...combos.map((c) => ({
      key: `combo:${c.id}`, type: "Combo" as const, name: c.name,
      // Giá chung của set. Set có mẫu mã kèm giá thì đây là giá thấp nhất
      // (con số "từ ..." ngoài trang bán); giá thật nằm ở từng mẫu mã.
      priceVn: comboPrice(c, boxes, flavors, "vn") ?? 0,
      priceKr: comboPrice(c, boxes, flavors, "kr") ?? 0,
      active: c.active, flavorIds: c.flavor_ids,
      ...common(c),
    })),
    ...flavors.map((f) => ({
      key: `flavor:${f.id}`, type: "Vị" as const, premium: f.premium, name: f.name,
      priceVn: f.price_vn, priceKr: f.price_kr, active: f.active,
      ...common(f),
    })),
  ];

  const mergedBase: Product[] = base.map((p) => {
    const o = ov[p.key] ?? {};
    const images = o.images ?? (o.image ? [o.image] : p.dbImages);
    return {
      ...p,
      images,
      name: o.name ?? p.name,
      code: o.code ?? p.code,
      category: o.category ?? p.category,
      priceVn: o.priceVn ?? p.priceVn,
      priceKr: o.priceKr ?? p.priceKr,
      cost: o.cost ?? p.cost,
      discount: o.discount ?? p.discount,
      stockQty: o.stockQty ?? p.stockQty,
      allowNegative: o.allowNegative ?? p.allowNegative,
      chargeShip: o.chargeShip ?? p.chargeShip,
      note: o.note ?? p.note,
      supplyLink: o.supplyLink ?? p.supplyLink,
      variants: o.variants ?? p.variants,
      active: o.active ?? p.active,
      flavorIds: o.flavorIds ?? p.flavorIds,
    };
  });
  // tách sản phẩm gốc đã xoá vào thùng rác (còn khôi phục được)
  const removedKeys = new Set(Object.entries(ov).filter(([, o]) => o.removed).map(([k]) => k));
  const visibleBase = mergedBase.filter((p) => !removedKeys.has(p.key));
  const trashBase = mergedBase.filter((p) => removedKeys.has(p.key));
  const merged: Product[] = showTrash ? trashBase : visibleBase;

  /** Lưu một sản phẩm: hiện ngay trên màn, rồi ghi xuống database. */
  const save = (key: string, patch: Override) => {
    setOv((cur) => ({ ...cur, [key]: { ...(cur[key] ?? {}), ...patch } }));
    if (!connected) {
      setSaveError(
        "Chưa nối cơ sở dữ liệu nên thay đổi này KHÔNG được lưu — tải lại trang là mất. Xem docs/supabase.md.",
      );
      return;
    }
    setSaving(true);
    setSaveError("");
    void (async () => {
      try {
        const res = await fetch(API_PRODUCTS, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, patch: toPatch(patch) }),
        });
        const data = await readJson<{ ok: boolean; error?: string }>(
          res,
          "Không lưu được sản phẩm",
        );
        if (!data.ok) throw new Error(data.error ?? "Không lưu được sản phẩm.");
        router.refresh();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Không lưu được sản phẩm.");
      } finally {
        setSaving(false);
      }
    })();
  };

  /** Tạo sản phẩm mới trong database rồi tải lại danh sách. */
  const createNew = async (type: Product["type"], patch: Override) => {
    if (!connected) {
      setSaveError("Chưa nối cơ sở dữ liệu nên chưa tạo được sản phẩm. Xem docs/supabase.md.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const kind = type === "Hộp" ? "box" : type === "Combo" ? "combo" : "flavor";
      const res = await fetch(API_PRODUCTS, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, patch: toPatch(patch) }),
      });
      const data = await readJson<{ ok: boolean; error?: string }>(res, "Không tạo được sản phẩm");
      if (!data.ok) throw new Error(data.error ?? "Không tạo được sản phẩm.");
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không tạo được sản phẩm.");
    } finally {
      setSaving(false);
    }
  };

  // gộp Override vào một Product đầy đủ (dùng cho sản phẩm tự thêm)
  const newProduct = (type: Product["type"]): Product => ({
    key: `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type,
    name: type === "Hộp" ? "Hộp mới" : type === "Combo" ? "Combo mới" : "Vị mới",
    code: "",
    category: "",
    priceVn: 0, priceKr: 0, cost: 0, discount: 0,
    images: [], active: true, flavorIds: [], variants: [], allowNegative: false, chargeShip: false, stockQty: 0,
  });

  const handleSave = (patch: Override) => {
    if (draft) {
      void createNew(draft.type, patch);
      setDraft(null);
    } else if (editKey) {
      save(editKey, patch);
      setEditKey(null);
    }
  };

  // Xoá = cho vào thùng rác, còn khôi phục được. Không xoá hẳn khỏi database vì
  // sản phẩm có thể đang được tham chiếu trong các đơn cũ.
  const removeAny = (key: string) => {
    save(key, { removed: true });
    setEditKey(null);
  };
  const restore = (key: string) => save(key, { removed: false });

  const editing = draft ?? (editKey ? merged.find((p) => p.key === editKey) ?? null : null);
  const afterDiscount = (price: number, disc: number) => Math.round(price * (1 - disc / 100));

  const TypeIcon = ({ t }: { t: Product["type"] }) =>
    t === "Hộp" ? <IconShirt width={15} height={15} /> : t === "Combo" ? <IconGift width={15} height={15} /> : <IconCart width={15} height={15} />;

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <h1 className="text-[15px] font-semibold text-slate-800">Sản phẩm</h1>
        <span className="text-[13px] text-slate-400">{merged.length} mục</span>
        {(trashBase.length > 0 || showTrash) && (
          <button
            onClick={() => setShowTrash((s) => !s)}
            className={`ml-auto rounded-lg border px-3 py-2 text-[13px] font-medium ${showTrash ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {showTrash ? "← Quay lại" : `Thùng rác (${trashBase.length})`}
          </button>
        )}
        {!showTrash && (
          <button
            onClick={() => setChooser(true)}
            className={`${trashBase.length > 0 ? "" : "ml-auto"} inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-blue-700`}
          >
            + Tạo sản phẩm
          </button>
        )}
        <a href="/san-pham" className="text-[13px] font-medium text-blue-600 hover:underline">Xem trang bán →</a>
      </header>

      {!connected && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-[12px] text-amber-800">
          Chế độ xem thử — chưa nối cơ sở dữ liệu, mọi thay đổi ở đây <b>không được lưu</b> và
          khách cũng không thấy. Xem <code>docs/supabase.md</code> để cắm biến môi trường.
        </div>
      )}
      {saveError && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-[12px] text-rose-700">
          {saveError}
        </div>
      )}
      {!showTrash && (
        <>
          <ShippingSettings warehouses={warehouses} connected={connected} />
          <BankQrSettings initialUrl={bankQrVn} />
        </>
      )}
      {saving && (
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-[12px] text-slate-500">
          Đang lưu…
        </div>
      )}

      <div className="p-5">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1040px] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Ảnh</th>
                <th className="px-4 py-2.5">Mã SP</th>
                <th className="px-4 py-2.5">Tên sản phẩm</th>
                <th className="px-4 py-2.5">Loại</th>
                <th className="px-4 py-2.5">Danh mục</th>
                <th className="px-4 py-2.5 text-center">Số mẫu mã</th>
                <th className="px-4 py-2.5 text-right">Giá bán (Hàn)</th>
                <th className="px-4 py-2.5">Kho · Có thể bán</th>
                <th className="px-4 py-2.5 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {merged.map((p) => {
                const sellable = p.stockQty;
                const negative = sellable < 0;
                return (
                  <tr key={p.key} className={showTrash ? "" : "cursor-pointer hover:bg-slate-50"} onClick={() => { if (!showTrash) setEditKey(p.key); }}>
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
                    <td className="px-4 py-2 font-mono text-[12px] text-slate-500">{p.code || "—"}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {p.name}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{p.type}{p.premium ? " · Premium" : ""}</td>
                    <td className="px-4 py-2 text-slate-500">{p.category || "—"}</td>
                    <td className="px-4 py-2 text-center text-slate-600">{p.variants?.length || 1}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-semibold text-slate-800">{krw(afterDiscount(p.priceKr, p.discount))}</span>
                      {p.discount ? <span className="ml-1 text-[11px] text-rose-500">-{p.discount}%</span> : null}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${negative ? "bg-rose-100 text-rose-700" : sellable === 0 ? "bg-slate-100 text-slate-500" : sellable <= 10 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                        >
                          {sellable}
                        </span>
                        {p.allowNegative && <span className="text-[10px] text-slate-400">(bán âm)</span>}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {showTrash ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); restore(p.key); }}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-700 hover:bg-blue-100"
                        >
                          Khôi phục
                        </button>
                      ) : (
                        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${p.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {p.active ? "Đang bán" : "Ẩn"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {showTrash && merged.length === 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-[13px] text-slate-400">Thùng rác trống.</div>
        )}
        <p className="mt-3 text-[12px] text-slate-400">
          {showTrash
            ? "Sản phẩm đã xoá — bấm “Khôi phục” để đưa lại danh sách."
            : "Bấm vào một sản phẩm để sửa/xoá. Cột “Có thể bán” là tồn kho của chính sản phẩm — khách đặt thì máy chủ tự trừ."}
        </p>
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
          onSave={handleSave}
          onDelete={!draft ? () => removeAny(editing.key) : undefined}
          // Đổi loại xong thì khoá sản phẩm cũng đổi, bản đang mở không còn tồn
          // tại — nạp lại danh sách để bảng hiện đúng loại mới.
          onConverted={() => router.refresh()}
          onClose={() => { setDraft(null); setEditKey(null); }}
        />
      )}

    </main>
  );
}

function TypeChooser({ onPick, onClose }: { onPick: (t: Product["type"]) => void; onClose: () => void }) {
  const opts: { t: Product["type"]; icon: React.ReactNode; desc: string }[] = [
    { t: "Hộp", icon: <IconShirt width={20} height={20} />, desc: "Vỏ hộp + nhiều mẫu mã (SET A/B/C…)" },
    { t: "Combo", icon: <IconGift width={20} height={20} />, desc: "Gộp nhiều bánh thành combo" },
    { t: "Vị", icon: <IconCart width={20} height={20} />, desc: "Một vị bánh bán lẻ" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-16 w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <h3 className="text-[15px] font-semibold text-slate-800">Tạo sản phẩm — chọn loại</h3>
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
  onSave,
  onDelete,
  onConverted,
  onClose,
}: {
  product: Product;
  create?: boolean;
  flavors: Flavor[];
  onSave: (patch: Override) => void;
  onDelete?: () => void;
  onConverted?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [code, setCode] = useState(product.code ?? "");
  const [category, setCategory] = useState(product.category ?? "");
  const [images, setImages] = useState<string[]>(product.images ?? []);
  const [url, setUrl] = useState("");
  const [cost, setCost] = useState(product.cost);
  const [priceVn, setPriceVn] = useState(product.priceVn);
  const [priceKr, setPriceKr] = useState(product.priceKr);
  const [discount, setDiscount] = useState(product.discount);
  const [stockQty, setStockQty] = useState(product.stockQty ?? 0);
  const [allowNegative, setAllowNegative] = useState(!!product.allowNegative);
  const [chargeShip, setChargeShip] = useState(!!product.chargeShip);
  const [note, setNote] = useState(product.note ?? "");
  const [supplyLink, setSupplyLink] = useState(product.supplyLink ?? "");
  const [variants, setVariants] = useState<Variant[]>(product.variants ?? []);
  const [active, setActive] = useState(product.active);
  const [flavorIds, setFlavorIds] = useState<string[]>(product.flavorIds ?? []);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasSet = product.type === "Hộp" || product.type === "Combo";
  const MAX = MAX_PRODUCT_IMAGES;

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // --- đổi loại sản phẩm ---
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState("");

  /**
   * Đổi loại = DỜI SẢN PHẨM SANG BẢNG KHÁC, không phải đổi một cái nhãn. Khoá
   * sản phẩm đổi theo, nên máy chủ từ chối nếu sản phẩm đã nằm trong đơn đã bán
   * hoặc đang bị set nào dùng — lúc đó hiện thẳng câu máy chủ trả về.
   */
  const convertTo = async (t: Product["type"]) => {
    if (t === product.type) return;
    const toKind = t === "Hộp" ? "box" : t === "Combo" ? "combo" : "flavor";
    if (
      !confirm(
        `Đổi "${product.name}" từ ${product.type} sang ${t}?\n\n` +
          `Những mục riêng của ${product.type} sẽ mất (VD số ô trong hộp, danh sách vị của set). ` +
          `Ảnh, giá, tồn kho và ghi chú thì giữ nguyên.`,
      )
    )
      return;

    setConverting(true);
    setConvertError("");
    try {
      const res = await fetch(API_CONVERT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: product.key, toKind }),
      });
      const data = await readJson<{ ok: boolean; error?: string; dropped?: string[] }>(
        res,
        "Không đổi được loại sản phẩm",
      );
      if (!data.ok) throw new Error(data.error ?? "Không đổi được loại sản phẩm.");
      if (data.dropped?.length) alert(`Đã đổi sang ${t}. Mục không mang theo được: ${data.dropped.join(", ")}.`);
      onConverted?.();
      onClose();
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : "Không đổi được loại sản phẩm.");
    } finally {
      setConverting(false);
    }
  };

  /**
   * Đẩy ảnh lên Supabase Storage rồi lưu URL.
   * Bản cũ nhúng ảnh dạng base64 vào localStorage: khách không thấy ảnh, và vài
   * sản phẩm là đầy bộ nhớ trình duyệt rồi mất sạch.
   */
  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX - images.length;
    if (room <= 0) return;

    const picked = Array.from(files).slice(0, room);

    setUploading(true);
    setUploadError("");
    try {
      // MỖI ẢNH MỘT LƯỢT GỬI. Gộp 6 ảnh vào một yêu cầu thì tổng dung lượng vượt
      // giới hạn 4.5MB của Vercel dù từng ảnh vẫn nhỏ — và hỏng là hỏng cả mẻ.
      // Gửi lẻ thì ảnh nào lên được cứ lên, hỏng ảnh nào báo ảnh đó.
      const urls: string[] = [];
      for (const raw of picked) {
        // Thu nhỏ trước khi gửi: ảnh điện thoại 3–12MB không tài nào lọt qua
        // giới hạn hạ tầng, mà thu xong chỉ còn vài trăm KB.
        const file = await shrinkImage(raw);
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(API_UPLOAD, { method: "POST", body: form });
        const data = await readJson<{ ok: boolean; urls?: string[]; error?: string }>(
          res,
          `Không tải được "${raw.name}"`,
        );
        if (!data.ok) throw new Error(data.error ?? `Không tải được "${raw.name}".`);
        urls.push(...(data.urls ?? []));
        // Ghi vào ngay từng ảnh: gửi 6 ảnh mà ảnh cuối hỏng thì 5 ảnh trước vẫn
        // còn, khỏi phải chọn lại từ đầu.
        setImages((cur) => [...cur, ...(data.urls ?? [])].slice(0, MAX));
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Không tải được ảnh lên.");
    } finally {
      setUploading(false);
    }
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

  // mẫu mã (thuộc tính)
  const addVariant = () =>
    setVariants((v) => [...v, { name: "", contents: "", price_vn: null, price_kr: null }]);
  const setVariant = (i: number, patch: Partial<Variant>) =>
    setVariants((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, j) => j !== i));

  const submit = () => {
    onSave({
      stockQty,
      name, code: code.trim() || undefined, category: category.trim() || undefined,
      images, image: images[0] || undefined,
      cost, priceVn, priceKr, discount,
      allowNegative,
      chargeShip,
      note: note.trim() || undefined,
      supplyLink: supplyLink.trim() || undefined,
      variants: hasSet ? variants.filter((v) => v.name.trim()) : undefined,
      active,
      flavorIds: hasSet ? flavorIds : undefined,
    });
  };

  const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <h3 className="text-[15px] font-semibold text-slate-800">{create ? "Tạo sản phẩm" : "Thiết lập sản phẩm"}</h3>
          {create ? (
            // Lúc tạo thì loại đã chọn ở bước trước, chưa có gì trong database để dời.
            <span className="text-[12px] text-slate-400">· {product.type}</span>
          ) : (
            <select
              value={product.type}
              disabled={converting}
              onChange={(e) => void convertTo(e.target.value as Product["type"])}
              title="Đổi loại sản phẩm"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-600 disabled:opacity-50"
            >
              <option value="Hộp">Hộp</option>
              <option value="Combo">Combo</option>
              <option value="Vị">Vị</option>
            </select>
          )}
          {converting && <span className="text-[12px] text-slate-400">Đang đổi…</span>}
          <button onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
            <IconXCircle width={20} height={20} />
          </button>
        </div>

        {convertError && (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-[12.5px] text-rose-600">
            {convertError}
          </div>
        )}

        <div className="max-h-[74vh] space-y-4 overflow-y-auto p-5">
          {/* ảnh sản phẩm */}
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
                  disabled={uploading}
                  className="grid h-16 w-16 place-items-center rounded-lg border-2 border-dashed border-slate-300 text-[11px] text-slate-400 hover:border-blue-400 hover:text-blue-500 disabled:opacity-50"
                >
                  {uploading ? "Đang tải…" : "+ Ảnh"}
                </button>
              )}
            </div>
            {uploadError && (
              <p className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-700">
                {uploadError}
              </p>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }} />
            {images.length < MAX && (
              <div className="mt-2 flex gap-2">
                <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} placeholder="hoặc dán URL ảnh rồi Enter" className={inp} />
                <button onClick={addUrl} className="flex-none rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50">Thêm</button>
              </div>
            )}
          </div>

          {/* mã + tên */}
          <div className="grid grid-cols-2 gap-3">
            <L label="Mã SP"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: 5862_TLQC" className={inp} /></L>
            <L label="Danh mục"><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="VD: 3d, 2d…" className={inp} /></L>
          </div>
          <L label="Tên sản phẩm *"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></L>

          {/* giá */}
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

          {/* tồn kho — nằm ngay trên sản phẩm, không phải liên kết SKU rời */}
          <div className="rounded-lg border border-slate-200 p-3">
            <span className="mb-2 block text-[12px] font-semibold text-slate-500">Kho hàng</span>
            <div className="grid grid-cols-2 gap-3">
              <L label="Tồn kho (còn bán được)">
                <input
                  type="number"
                  value={stockQty}
                  onChange={(e) => setStockQty(Number(e.target.value) || 0)}
                  className={`${inp} ${stockQty < 0 ? "border-rose-300 text-rose-600" : ""}`}
                />
              </L>
              <div className="flex items-end pb-1.5">
                <p className="text-[11.5px] leading-relaxed text-slate-400">
                  Khách đặt là máy chủ tự trừ. Số này dùng chung cho mọi máy.
                </p>
              </div>
            </div>
            {stockQty < 0 && (
              <p className="mt-1.5 text-[11.5px] font-medium text-rose-600">
                Đang âm {Math.abs(stockQty)} — đã nhận đơn nhiều hơn số hàng có thật.
              </p>
            )}
          </div>

          {/* mẫu mã (thuộc tính) — Hộp / Combo */}
          {hasSet && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center">
                <span className="text-[12px] font-semibold text-slate-500">Mẫu mã / Thuộc tính ({variants.length})</span>
                <button onClick={addVariant} className="ml-auto rounded-lg bg-blue-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-blue-700">+ Thêm mẫu mã</button>
              </div>
              {variants.length === 0 && (
                <p className="text-[12px] text-slate-400">
                  Chưa có mẫu mã. Dùng khi cùng một sản phẩm bán nhiều kiểu khác giá —
                  VD Vinh Hiển: “Nhân đặc biệt” 55.000₩ và “Nhân cổ truyền cao cấp” 60.000₩.
                </p>
              )}
              <div className="space-y-2.5">
                {variants.map((v, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                    <div className="flex gap-2">
                      <input
                        value={v.name}
                        onChange={(e) => setVariant(i, { name: e.target.value })}
                        placeholder="Nhân đặc biệt"
                        className="w-44 flex-none rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] font-medium outline-none focus:border-blue-400"
                      />
                      <input
                        value={v.contents}
                        onChange={(e) => setVariant(i, { contents: e.target.value })}
                        placeholder="matcha · thập cẩm · đậu xanh…"
                        className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-blue-400"
                      />
                      <button
                        onClick={() => removeVariant(i)}
                        title="Xoá mẫu mã"
                        className="flex-none rounded-lg border border-slate-200 bg-white px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                      >
                        🗑
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
                        Giá Hàn ₩
                        <input
                          type="number"
                          value={v.price_kr ?? ""}
                          onChange={(e) =>
                            setVariant(i, { price_kr: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          placeholder="theo giá chung"
                          className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-blue-400"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
                        Giá VN đ
                        <input
                          type="number"
                          value={v.price_vn ?? ""}
                          onChange={(e) =>
                            setVariant(i, { price_vn: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          placeholder="theo giá chung"
                          className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-blue-400"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              {variants.length > 0 && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                  Mẫu mã có giá thì trang bán hiện <b>một thẻ sản phẩm</b> với mỗi mẫu mã một nút bấm
                  kèm giá riêng, giá lớn ghi “từ …”. Bỏ trống ô giá thì mẫu mã đó chỉ là mô tả và
                  dùng giá chung ở trên.
                </p>
              )}

              {/* biến thể bánh cho set (danh sách vị được phép) */}
              <L label={`Bánh được phép cho vào set (${flavorIds.length})`}>
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
              </L>
            </div>
          )}

          {/* ghi chú + link nhập hàng */}
          <div className="grid grid-cols-1 gap-3">
            <L label="Ghi chú nội bộ"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inp} /></L>
            <L label="Link nhập hàng"><input value={supplyLink} onChange={(e) => setSupplyLink(e.target.value)} placeholder="Dán link sản phẩm nhập" className={inp} /></L>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-blue-600" />
            Đang bán
          </label>

          {/* Phí ship theo MÓN, không theo kho — xem lib/pricing.ts §0022. */}
          <label className="flex items-start gap-2 text-[13px] text-slate-700">
            <input
              type="checkbox"
              checked={chargeShip}
              onChange={(e) => setChargeShip(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span>
              Thu phí ship riêng cho món này
              <span className="mt-0.5 block text-[11.5px] text-slate-400">
                Không tích = giá đã gồm ship, khách không phải trả thêm. Tích thì kiện nào có
                món này sẽ chịu phí ship của kho, thu một lần cho cả kiện. Mức phí đặt ở
                mục Phí vận chuyển.
              </span>
            </span>
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
