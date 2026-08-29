"use client";

import { useState } from "react";
import { parseOrderNote, type ParsedNote } from "@/lib/orders/parseNote";
import type { Box, Combo, Flavor, Region } from "@/lib/types";
import { IconXCircle } from "@/components/icons";

// ============================================================================
// Ô "dán ghi chú → thành đơn" — trông như một đoạn chat.
//
// Nhân viên dán nguyên tin nhắn khách (SĐT + địa chỉ + set + vị + tiền + ngày
// giao), bộ đọc `parseOrderNote` tách thành từng ô và trả lời như một trợ lý:
// đọc được gì, thiếu gì. Bấm "Tạo đơn từ ghi chú" là mở form tạo đơn ĐÃ ĐIỀN
// SẴN — người vẫn duyệt và bấm lưu, hệ thống không tự chốt đơn một mình.
//
// Con đường dữ liệu vẫn là một: form tạo đơn cũ → API cũ → kho trừ như cũ.
// Ô chat chỉ là bàn phím nhanh hơn, không phải một luồng tạo đơn thứ hai.
// ============================================================================

const EXAMPLE = `Chị Hoa 010-2345-6789
Ansan, Danwon-gu, Seonbu-dong 123
1 hộp Kim Ngọc Các, vị lava trứng muối x2, trà xanh đậu đỏ x2
cọc 30k, giao 25/9, tặng kèm thiệp`;

export default function NoteToOrder({
  boxes,
  flavors,
  combos,
  regionHint,
  onConfirm,
  onClose,
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  /** Vùng đang lọc ở bảng đơn — mặc định khi ghi chú không lộ vùng. */
  regionHint: Region;
  /** Bấm "Tạo đơn từ ghi chú" → mở form tạo đơn với bản nháp này. */
  onConfirm: (parsed: ParsedNote, rawNote: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedNote | null>(null);
  /** Ghi chú đã phân tích — giữ lại để nút xác nhận dùng đúng bản đã đọc. */
  const [askedText, setAskedText] = useState("");

  const run = () => {
    if (!text.trim()) return;
    setParsed(parseOrderNote(text, { boxes, flavors, combos }, regionHint));
    setAskedText(text);
  };

  const Row = ({ label, value }: { label: string; value?: string }) => (
    <div className="flex gap-2 text-[12.5px]">
      <span className={`w-4 flex-none text-center ${value ? "text-emerald-600" : "text-amber-500"}`}>
        {value ? "✓" : "?"}
      </span>
      <span className="w-20 flex-none text-slate-400">{label}</span>
      <span className={value ? "text-slate-800" : "italic text-slate-400"}>
        {value ?? "chưa đọc ra — điền tay ở bước sau"}
      </span>
    </div>
  );

  const moneyStr = (v?: number) => (v == null ? undefined : v.toLocaleString("vi-VN"));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <span className="text-[16px]">⚡</span>
          <h3 className="text-[15px] font-semibold text-slate-800">Dán ghi chú → thành đơn</h3>
          <button onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
            <IconXCircle width={20} height={20} />
          </button>
        </div>

        <div className="max-h-[72vh] space-y-3 overflow-y-auto bg-slate-50/60 p-5">
          {/* bong bóng hướng dẫn — phía "trợ lý" */}
          <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-600">
            Dán nguyên tin nhắn của khách vào đây — SĐT, địa chỉ, tên set, vị bánh, tiền cọc, ngày
            giao, ghi chú… Em đọc rồi điền sẵn vào form tạo đơn, anh chỉ việc duyệt.
            <button
              onClick={() => setText(EXAMPLE)}
              className="mt-1.5 block text-[11.5px] font-medium text-blue-600 hover:underline"
            >
              Chèn thử ví dụ mẫu
            </button>
          </div>

          {/* bong bóng của người dán — sau khi phân tích */}
          {parsed && (
            <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-blue-600 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white">
              {askedText}
            </div>
          )}

          {/* bong bóng kết quả — phía "trợ lý" */}
          {parsed && (
            <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
              <p className="mb-2 text-[12.5px] font-medium text-slate-700">Em đọc được thế này:</p>
              <div className="space-y-1.5">
                <Row label="Khách" value={parsed.customer} />
                <Row label="SĐT" value={parsed.phone} />
                <Row label="Địa chỉ" value={parsed.address} />
                <Row
                  label="Món"
                  value={
                    parsed.items?.length
                      ? parsed.items.map((pi) => `${pi.label} ×${pi.qty}`).join(" · ")
                      : undefined
                  }
                />
                {parsed.unknownItems && parsed.unknownItems.length > 0 && (
                  <Row label="Chưa nhận ra" value={`"${parsed.unknownItems.join('" · "')}" — không có trong danh mục`} />
                )}
                {parsed.flavors && parsed.flavors.length > 0 && (
                  <Row label="Vị bánh" value={parsed.flavors.join(", ")} />
                )}
                <Row label="Đã cọc" value={moneyStr(parsed.prepaid)} />
                {parsed.total != null && <Row label="Khách chốt" value={moneyStr(parsed.total)} />}
                <Row label="Ngày giao" value={parsed.date} />
                {parsed.note && <Row label="Ghi chú" value={parsed.note} />}
              </div>
              {parsed.total != null && (
                <p className="mt-2 text-[11.5px] text-amber-600">
                  Số "khách chốt" chỉ để đối chiếu — giá thật lấy theo danh mục lúc anh duyệt form.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => onConfirm(parsed, askedText)}
                  className="rounded-lg bg-blue-600 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-blue-700"
                >
                  Tạo đơn từ ghi chú →
                </button>
                <button
                  onClick={() => setParsed(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] text-slate-600 hover:bg-slate-50"
                >
                  Dán lại
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ô nhập kiểu khung chat */}
        <div className="flex items-end gap-2 border-t border-slate-200 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
            }}
            rows={4}
            placeholder="Dán ghi chú của khách vào đây… (Ctrl/⌘ + Enter để đọc)"
            className="flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400"
          />
          <button
            onClick={run}
            disabled={!text.trim()}
            className="grid h-10 w-10 flex-none place-items-center rounded-full bg-blue-600 text-[16px] text-white transition active:scale-95 disabled:opacity-40"
            title="Đọc ghi chú"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
