"use client";

import { useState } from "react";
import { parseOrderNote, type ParsedNote } from "@/lib/orders/parseNote";
import {
  sellableItems,
  comboPickCount,
  comboPickPool,
  describePickedFlavors,
  type CartLine,
} from "@/lib/pricing";
import { formatMoney } from "@/lib/money";
import type { Box, Combo, Flavor, Region } from "@/lib/types";

// ============================================================================
// Ô "đặt nhanh" cho KHÁCH ở trang bán — bản công khai của NoteToOrder.
//
// Khách dán một cục chữ (tên + SĐT + địa chỉ + set + vị + ngày giao), bộ đọc
// tách ra rồi hiện lại "Em hiểu thế này" để khách soát. Bấm đặt là món vào giỏ
// và tên/SĐT/địa chỉ/ngày điền sẵn vào trang đặt hàng — khách chỉ xem lại và
// bấm Đặt như luồng thường.
//
// KHÔNG tự chốt đơn: mọi thứ vẫn đi qua /dat-hang, nơi máy chủ kiểm giá, kiểm
// vị, kiểm địa chỉ. Ô này chỉ là bàn phím nhanh, không phải cửa hậu.
//
// Cách chuyển tiếp: ghi thẳng vào blob `tr_cart` trong localStorage — đúng cái
// OrderFlow khôi phục lúc mở /dat-hang (cart, buyerName, buyerPhone,
// recipients…). Không chế thêm kênh truyền nào khác.
// ============================================================================

const CART_KEY = "tr_cart";

const EXAMPLE = `Chị Hoa 010-2345-6789
Ansan, Danwon-gu, Seonbu-dong 123
1 hộp Kim Ngọc Các, vị lava trứng muối chảy x2, dẻo kem trứng muối x2
giao 25/9, tặng kèm thiệp chúc mừng`;

export default function QuickOrderChat({
  boxes,
  flavors,
  combos,
  region,
  onClose,
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  /** Vùng người đặt đang chọn trên trang bán — bảng giá đọc theo đây. */
  region: Region;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedNote | null>(null);
  const [askedText, setAskedText] = useState("");

  const run = () => {
    if (!text.trim()) return;
    setParsed(parseOrderNote(text, { boxes, flavors, combos }, region));
    setAskedText(text);
  };

  /**
   * Bỏ món đã hiểu vào giỏ + điền sẵn người đặt/người nhận, rồi sang /dat-hang.
   *
   * Set khách tự chọn vị: nếu tổng số bánh khách nhắn ĐÚNG bằng số ngăn thì lấy
   * y nguyên; lệch thì lấy tạm các vị đầu danh sách (đúng cách nút deep-link đã
   * làm) và ghi rõ trong giỏ — khách thấy ngay ở bước xem lại, còn nguyên văn
   * lời nhắn vẫn nằm trong ghi chú đơn nên shop không mất thông tin.
   */
  const confirm = () => {
    if (!parsed) return;
    const buyRegion = parsed.region ?? region;

    let blob: { cart?: CartLine[]; recipients?: unknown[]; [k: string]: unknown } = {};
    try {
      blob = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
    } catch {
      /* ignore */
    }
    const cart: CartLine[] = Array.isArray(blob.cart) ? blob.cart : [];
    const olds = [...cart, ...((blob.recipients as { uid?: string }[]) ?? [])];
    let seq = olds.reduce((m, x) => Math.max(m, parseInt(String(x.uid ?? "").replace(/\D/g, "")) || 0), 0);
    const nextUid = () => "u" + ++seq;

    // --- người nhận (khách đặt cho chính mình là mặc định của luồng nhanh) ---
    const rUid = nextUid();
    const recipient = {
      uid: rUid,
      name: parsed.customer ?? "",
      phone: parsed.phone ?? "",
      address: parsed.address ?? "",
      region: buyRegion,
      desiredDate: parsed.date ?? "",
      note: parsed.note ?? "",
    };

    // --- món vào giỏ: TẤT CẢ món đã khớp, mỗi món một dòng giỏ ---
    const items = sellableItems(combos, boxes, flavors, buyRegion);
    for (const pi of parsed.items ?? []) {
      const it = items.find((x) => x.key === pi.key);
      if (it) {
        const qty = pi.qty;
        if (it.comboId) {
          const combo = combos.find((c) => c.id === it.comboId);
          const need = combo ? comboPickCount(combo) : 0;
          let flavorIds = combo?.flavor_ids ?? [];
          if (combo && need) {
            // vị gắn riêng cho món này (nhắn sau tên set nào thì của set đó);
            // tin nhắn kiểu cũ không tách theo set thì dùng danh sách chung
            const picked = ((pi.flavorPicks ?? parsed.flavorPicks) ?? [])
              .filter((f) => combo.flavor_ids.includes(f.id))
              .flatMap((f) => Array.from({ length: f.qty }, () => f.id));
            const pool = comboPickPool(combo, flavors);
            flavorIds =
              picked.length === need
                ? picked
                : Array.from({ length: need }, (_, i) => pool[i % pool.length].id);
          }
          cart.push({
            uid: nextUid(),
            kind: "combo",
            boxId: combo?.box_id ?? undefined,
            comboId: it.comboId,
            variantName: it.variantName,
            flavorIds,
            flavorText: need ? describePickedFlavors(flavorIds, flavors) : undefined,
            qty,
            unitPrice: it.price,
            name: it.label,
            recipientUids: [rUid],
          });
        } else if (it.flavorId) {
          cart.push({
            uid: nextUid(),
            kind: "la",
            flavorIds: [it.flavorId],
            qty,
            unitPrice: it.price,
            name: it.label,
            recipientUids: [rUid],
          });
        }
      }
    }

    try {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify({
          ...blob,
          cart,
          buyerRegion: buyRegion,
          buyerName: parsed.customer ?? "",
          buyerPhone: parsed.phone ?? "",
          recipients: [...((blob.recipients as unknown[]) ?? []), recipient],
        }),
      );
    } catch {
      /* localStorage đầy — sang trang đặt hàng gõ tay vậy */
    }
    window.location.href = "/dat-hang";
  };

  const Row = ({ label, value }: { label: string; value?: string }) => (
    <div className="flex gap-2 text-[12.5px]">
      <span className={`w-4 flex-none text-center ${value ? "text-emerald-600" : "text-gold-deep"}`}>
        {value ? "✓" : "?"}
      </span>
      <span className="w-[74px] flex-none text-ink/40">{label}</span>
      <span className={value ? "text-ink/85" : "italic text-ink/40"}>
        {value ?? "chưa rõ — điền thêm ở bước sau"}
      </span>
    </div>
  );

  const catalogItems = sellableItems(combos, boxes, flavors, parsed?.region ?? region);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-app flex-col rounded-t-2xl border-t border-line bg-cream"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-[16px]">⚡</span>
          <h3 className="text-[14px] font-semibold text-navy">Đặt nhanh — dán tin nhắn là xong</h3>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-black/10 text-[15px] leading-none text-navy"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink/70">
            Anh/chị gõ hoặc dán một tin nhắn có đủ: <b>tên · SĐT · địa chỉ · set quà · vị bánh ·
            ngày giao</b> — em đọc rồi điền sẵn vào trang đặt hàng, anh/chị chỉ xem lại và bấm đặt.
            <button
              onClick={() => setText(EXAMPLE)}
              className="mt-1.5 block text-[11.5px] font-semibold text-gold-deep hover:underline"
            >
              Chèn thử ví dụ mẫu
            </button>
          </div>

          {parsed && (
            <div className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-navy px-3.5 py-2.5 text-[12.5px] leading-relaxed text-cream">
              {askedText}
            </div>
          )}

          {parsed && (
            <div className="max-w-[94%] rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-3 shadow-card">
              <p className="mb-2 text-[12.5px] font-semibold text-navy">Em hiểu thế này:</p>
              <div className="space-y-1.5">
                <Row label="Tên" value={parsed.customer} />
                <Row label="SĐT" value={parsed.phone} />
                <Row label="Địa chỉ" value={parsed.address} />
                <Row
                  label="Món"
                  value={
                    parsed.items?.length
                      ? parsed.items
                          .map((pi) => {
                            const it = catalogItems.find((x) => x.key === pi.key);
                            return `${pi.label} ×${pi.qty}${it ? ` — ${formatMoney(it.price, parsed.region ?? region)}/hộp` : ""}`;
                          })
                          .join(" · ")
                      : undefined
                  }
                />
                {parsed.unknownItems && parsed.unknownItems.length > 0 && (
                  <Row label="Chưa nhận ra" value={`"${parsed.unknownItems.join('" · "')}" — shop sẽ đọc trong ghi chú`} />
                )}
                {parsed.flavors && parsed.flavors.length > 0 && (
                  <Row
                    label="Vị bánh"
                    value={(parsed.flavorPicks ?? [])
                      .map((f) => (f.qty > 1 ? `${f.name} ×${f.qty}` : f.name))
                      .join(" · ")}
                  />
                )}
                <Row label="Ngày giao" value={parsed.date} />
              </div>
              <p className="mt-2 text-[11px] text-ink/45">
                Giá tính theo bảng giá của shop. Thiếu gì điền tiếp ở bước sau, không mất công gõ lại
                từ đầu.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={confirm}
                  className="flex-1 rounded-full bg-gold px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-white transition active:scale-95"
                >
                  Xem lại & đặt hàng →
                </button>
                <button
                  onClick={() => setParsed(null)}
                  className="rounded-full border border-line bg-white px-4 py-2.5 text-[12px] font-semibold text-navy"
                >
                  Sửa lại
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-line bg-cream p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={"Ví dụ:\nChị Hoa 010-2345-6789\nAnsan, Danwon-gu…\n1 hộp Kim Ngọc Các, vị lava x2…"}
            className="flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-gold"
          />
          <button
            onClick={run}
            disabled={!text.trim()}
            aria-label="Đọc tin nhắn"
            className="grid h-11 w-11 flex-none place-items-center rounded-full bg-gold text-[16px] text-white transition active:scale-95 disabled:opacity-40"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
