"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrderRow, Status } from "@/lib/ordersMock";
import { STATUS_COLOR, PIPELINE } from "@/lib/ordersMock";
import { messengerInboxUrl } from "@/lib/messenger";
import { currencyOfRow, displayCode, type StoredOrder } from "@/lib/orders/orderSchema";
import {
  describeItems,
  itemName,
  itemsGoods,
  itemsFromConsume,
  type OrderItem,
} from "@/lib/orders/orderItems";
import { sellableItems } from "@/lib/pricing";
import type { Box, Combo, Currency, Flavor, Region } from "@/lib/types";
import {
  IconFacebook,
  IconGlobe,
  IconStore,
  IconXCircle,
  IconPlus,
  IconTrash,
} from "@/components/icons";

export interface HistoryEntry {
  at: string;
  by: string;
  changes: string[];
}

const ALL_STATUS: Status[] = [...PIPELINE, "Khách trả lại", "Đã hoàn toàn bộ", "Huỷ đơn"];
const CARRIERS = ["", "Viettel", "GHN", "GHTK", "CJ", "Vinaphone", "Vietnamobile"];

/**
 * Tiền theo TIỀN TỆ CỦA ĐƠN, không theo kho giao.
 *
 * Người ở Hàn đặt quà gửi về Việt Nam thì kho là VN nhưng đơn tính bằng ₩ (§5).
 * Format theo kho như trước là mọi con số trong popup đổi mặt tiền tệ.
 */
const nat = (v: number, cur: Currency) =>
  cur === "krw" ? "₩" + Math.round(v).toLocaleString("en-US") : Math.round(v).toLocaleString("vi-VN") + "đ";

/**
 * Ai đặt đơn Facebook này.
 *
 * Trước đây đơn Facebook chỉ có mỗi cái thẻ "Facebook" — không cách nào biết
 * khách nào, cũng không bấm sang cuộc chat được. Tên lấy từ link truy vết
 * (§0015/0016); mở cuộc chat cần thêm Page ID vì PSID chỉ có nghĩa trong hộp
 * thư của đúng Trang đó.
 */
function MessengerTag({ order, pageId }: { order: OrderRow; pageId?: string }) {
  // Chưa tra ra danh tính thì vẫn còn nguyên văn ?ref — với link mẫu Pancake,
  // chính mã đó là PSID nên mở được cuộc chat.
  const psid = order.psid || order.refToken;
  const name = order.messengerName;

  // Dán nhầm ID TRANG vào ô ID khách là lỗi hay gặp — hai số nằm cạnh nhau
  // trong cùng một đường dẫn hộp thư. Số đó không mở được chat của ai, nên nói
  // thẳng thay vì dựng một nút bấm vào rồi lạc.
  const nhamPage = Boolean(pageId && psid && pageId === psid);

  // Link Pancake đứng trước: đó là link CHÍNH CHỦ trả về, còn link Business
  // Suite là mình tự chế từ hai mã rời — chỗ tự chế đã hỏng bốn lượt liên tiếp.
  const url = order.conversationLink || (nhamPage ? null : messengerInboxUrl(pageId, psid));

  if (!name && !psid && !order.conversationLink)
    return (
      <span
        className="text-[11.5px] text-slate-400"
        title="Đơn không đến từ link truy vết nên không biết khách Messenger nào."
      >
        chưa gắn khách Messenger
      </span>
    );

  if (nhamPage && !order.conversationLink)
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-700"
        title="Số đang lưu là ID Trang, không phải ID khách. Mở cuộc chat của khách trong hộp thư rồi copy selected_item_id — đó mới là ID khách."
      >
        {name ?? "Khách"} · đang lưu nhầm ID Trang
      </span>
    );

  if (url)
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[12px] font-medium text-blue-700 hover:bg-blue-100"
        title="Mở cuộc chat trong hộp thư Trang"
      >
        {name ?? `Khách ${psid}`} ↗
      </a>
    );

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-600"
      title={
        psid
          ? "Vào trang Link Messenger điền ID Trang Facebook để bấm mở được cuộc chat."
          : "Tên Facebook khách tự khai lúc đặt. Chưa có mã khách nên chưa mở thẳng cuộc chat được."
      }
    >
      {name ?? `Khách ${psid}`}
    </span>
  );
}

function SrcBadge({ s }: { s: OrderRow["source"] }) {
  const map = {
    facebook: { Icon: IconFacebook, label: "Facebook", cls: "text-[#1877F2]" },
    web: { Icon: IconGlobe, label: "Online", cls: "text-emerald-500" },
    pos: { Icon: IconStore, label: "Tại quầy", cls: "text-slate-400" },
  } as const;
  const { Icon, label, cls } = map[s];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600">
      <Icon width={14} height={14} className={cls} /> {label}
    </span>
  );
}

/** Bản nháp đang sửa trong popup — có thêm hàng trong kiện so với dòng bảng. */
type Draft = OrderRow & { items?: OrderItem[] };

export default function OrderDetailModal({
  order,
  history,
  boxes,
  flavors,
  combos,
  fbPageId,
  onSave,
  onClose,
}: {
  order: OrderRow;
  history: HistoryEntry[];
  /** Danh mục ĐẦY ĐỦ (kể cả hàng đã tắt bán) — để gọi đúng tên món trong đơn cũ. */
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  /** ID Trang Facebook — không có thì không mở được cuộc chat, chỉ hiện tên. */
  fbPageId?: string;
  onSave: (updated: OrderRow, changes: string[]) => void;
  onClose: () => void;
}) {
  // Chuẩn hoá ngay lúc mở: COD = tổng − đã cọc, theo đúng định nghĩa.
  // Đơn dính lỗi cũ (COD gõ tay làm đơn dày thêm) tự về đúng, bấm Lưu là xong.
  const [d, setD] = useState<Draft>(() => {
    const ship = order.shipFee ?? 0;
    const goodsAmt = order.goodsAmount ?? Math.max(0, order.prepaid + order.cod - ship);
    const tong = goodsAmt + ship;
    const daCoc = Math.min(Math.max(0, order.prepaid), tong);
    // `items` cố ý BỎ RA KHỎI bản nháp: có mặt trong gói gửi đi là máy chủ hiểu
    // "sửa hàng" và viết lại toàn bộ dòng hàng của kiện — kể cả khi anh chỉ gõ
    // một chữ vào ô ghi chú. Nó chỉ được gắn lại lúc lưu, và chỉ khi đã sửa.
    return { ...order, items: undefined, prepaid: daCoc, cod: tong - daCoc };
  });
  const [saved, setSaved] = useState(false);

  const cur = currencyOfRow(order);
  const money = (v: number) => nat(v, cur);
  const set = <K extends keyof OrderRow>(k: K, v: OrderRow[K]) => {
    setD((o) => ({ ...o, [k]: v }));
    setSaved(false);
  };

  // ---- hàng trong kiện ----
  // Giá theo vùng NGƯỜI ĐẶT, suy từ tiền tệ của đơn — không phải kho giao.
  const buyer: Region = cur === "krw" ? "kr" : "vn";
  const cat = useMemo(() => ({ boxes, combos, flavors }), [boxes, combos, flavors]);
  const shipFee = d.shipFee ?? 0;
  // Mốc CỦA ĐƠN ĐANG LƯU, không phải của bản nháp — có nó mới hiện được "cũ →
  // mới" và biết tiền hàng đã đổi bao nhiêu.
  const storedGoods = order.goodsAmount ?? Math.max(0, order.prepaid + order.cod - shipFee);

  /**
   * Dòng hàng đọc từ `order_line`; đơn tạo tay chưa có dòng nào thì dựng tạm từ
   * tiêu hao kho.
   */
  const readItems = (o: OrderRow): OrderItem[] =>
    (o as StoredOrder).items?.length
      ? (o as StoredOrder).items!
      : itemsFromConsume(o.consume, o.goodsAmount ?? storedGoods, cat, buyer);

  const [items, setItems] = useState<OrderItem[]>(() => readItems(order));
  /** Bản gốc để so ra "đã sửa những gì" khi ghi vào lịch sử. */
  const [base, setBase] = useState<OrderItem[]>(items);
  /**
   * Đã đụng vào hàng chưa.
   *
   * Chưa đụng thì TIỀN HÀNG GIỮ NGUYÊN con số đã chốt lúc đặt, kể cả khi bảng
   * giá hôm nay khác. Mở popup ra xem mà đơn tự đổi tiền là đúng cái lỗi từng
   * làm đơn dày thêm mỗi lần bấm vào.
   */
  const [itemsDirty, setItemsDirty] = useState(false);

  /**
   * Lưu xong, đơn tải lại về thì lấy lại dòng hàng THẬT của database.
   *
   * Món vừa thêm lúc này mới có `lineId`; không nhận lại thì lần sửa tiếp theo
   * trong cùng phiên coi nó là món mới lần nữa — dòng cũ bị xoá, dòng mới chèn
   * vào và ăn theo bảng giá hiện tại thay vì giá vừa chốt.
   */
  useEffect(() => {
    if (!saved) return;
    const fresh = (order as StoredOrder).items;
    if (!fresh?.length) return;
    setItems(fresh);
    setBase(fresh);
    setItemsDirty(false);
  }, [order, saved]);

  // Món bán được để chọn thêm. Món trong đơn cũ đã ngừng bán không nằm trong
  // danh sách này — chỗ dựng <select> tự chèn thêm để không nhảy sang món khác.
  const picker = useMemo(
    () => sellableItems(combos, boxes, flavors, buyer),
    [combos, boxes, flavors, buyer],
  );
  const optValue = (it: Pick<OrderItem, "key" | "variant">) => `${it.key}|${it.variant ?? ""}`;
  const options = useMemo(
    () =>
      picker.map((s) => ({
        value: `${s.consumeKey}|${s.variantName ?? ""}`,
        label: `${s.label} — ${nat(s.price, cur)}`,
        key: s.consumeKey,
        variant: s.variantName,
        price: s.price,
      })),
    [picker, cur],
  );

  /** Sửa hàng thì tiền hàng, tóm tắt và cách chia tiền phải đi theo ngay. */
  const commitItems = (next: OrderItem[]) => {
    const goods = itemsGoods(next);
    const tong = goods + shipFee;
    setItems(next);
    setItemsDirty(true);
    setD((o) => {
      const daCoc = Math.min(Math.max(0, o.prepaid), tong);
      return {
        ...o,
        goodsAmount: goods,
        product: describeItems(next, cat),
        prepaid: daCoc,
        cod: tong - daCoc,
      };
    });
    setSaved(false);
  };

  const setQty = (i: number, qty: number) =>
    commitItems(items.map((it, j) => (j === i ? { ...it, qty: Math.max(1, Math.floor(qty) || 1) } : it)));

  /** Đổi món của một dòng = bỏ dòng cũ, thêm dòng mới → giá lấy từ bảng giá. */
  const setProduct = (i: number, value: string) => {
    const opt = options.find((o) => o.value === value);
    if (!opt) return;
    commitItems(
      items.map((it, j) =>
        j === i ? { key: opt.key, variant: opt.variant, qty: it.qty, unitPrice: opt.price } : it,
      ),
    );
  };

  const addItem = () => {
    const opt = options[0];
    if (!opt) return;
    commitItems([...items, { key: opt.key, variant: opt.variant, qty: 1, unitPrice: opt.price }]);
  };

  const removeItem = (i: number) => commitItems(items.filter((_, j) => j !== i));

  // TỔNG PHẢI THU LẤY TỪ GIÁ NIÊM YẾT LÚC ĐẶT, không suy từ cách chia tiền.
  //
  // Bản đầu tiên lấy `prepaid + cod` làm mốc. Sai ở chỗ: đó là cách chia tiền,
  // không phải giá đơn. Gõ 50.000 vào ô COD là đơn tự dày thêm 50.000 — và con
  // số sai đó được lưu xuống database. Nay mốc là goods_amount + phí ship, cả
  // hai đều chốt lúc tạo đơn theo bảng giá (§0013).
  //
  // Đơn cũ chưa có goods_amount thì lùi về prepaid + cod như trước.
  //
  // Sửa hàng xong thì mốc là tổng tiền của các dòng hàng — máy chủ cũng tính lại
  // đúng như vậy từ danh mục, nên hai bên không lệch nhau.
  const goods = itemsDirty ? itemsGoods(items) : storedGoods;
  const total = goods + shipFee;



  /** Sửa một ô thì ô kia bù lại, giữ nguyên tổng và không đụng tới cước ship. */
  const setSplit = (which: "prepaid" | "cod", raw: number) => {
    const v = Math.min(Math.max(0, Math.round(raw) || 0), total);
    setD((o) => ({ ...o, prepaid: which === "prepaid" ? v : total - v, cod: which === "cod" ? v : total - v }));
    setSaved(false);
  };

  const paidFull = d.cod === 0 && d.prepaid > 0;

  function diff(): string[] {
    const out: string[] = [];
    const cmp = (label: string, a: unknown, b: unknown, fmt?: (x: never) => string) => {
      if (String(a ?? "") !== String(b ?? "")) {
        const f = (x: unknown) => (fmt ? fmt(x as never) : String(x ?? "—")) || "—";
        out.push(`${label}: ${f(a)} → ${f(b)}`);
      }
    };
    cmp("Trạng thái", order.status, d.status);
    cmp("Ghi chú", order.note, d.note);
    cmp("Người nhận", order.recipient, d.recipient);
    cmp("SĐT", order.phone, d.phone);
    cmp("Địa chỉ", order.address, d.address);
    cmp("ĐVVC", order.carrier, d.carrier);
    cmp("Dự kiến nhận", order.expected, d.expected);
    cmp("NV chăm sóc", order.assignee, d.assignee);
    cmp("Trả trước", order.prepaid, d.prepaid, (x: number) => money(x));
    cmp("COD", order.cod, d.cod, (x: number) => money(x));
    if (itemsDirty) {
      cmp("Hàng", describeItems(base, cat) || order.product || "—", describeItems(items, cat));
      cmp("Tiền hàng", storedGoods, goods, (x: number) => money(x));
    }
    return out;
  }

  function handleSave() {
    const changes = diff();
    if (changes.length === 0) {
      setSaved(true);
      return;
    }
    // `items` chỉ gửi kèm khi anh thật sự sửa hàng — gửi luôn thì mỗi lần lưu
    // ghi chú cũng viết lại toàn bộ dòng hàng của đơn.
    onSave(itemsDirty ? { ...d, items } : d, changes);
    setSaved(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-5xl rounded-2xl bg-slate-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex flex-wrap items-center gap-3 rounded-t-2xl border-b border-slate-200 bg-white px-5 py-3">
          <span className="text-[17px] font-bold text-slate-800">{displayCode(d)}</span>
          <SrcBadge s={d.source} />
          {d.customerCode && (
            <span
              className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11.5px] text-slate-500"
              title="Mã khách hàng"
            >
              {d.customerCode}
            </span>
          )}
          {/* Khách vào thẳng website vẫn khai được tên Facebook ở form đặt hàng,
              nên không chỉ đơn nguồn Facebook mới có tên để hiện. */}
          {(d.source === "facebook" || d.messengerName) && (
            <MessengerTag order={d} pageId={fbPageId} />
          )}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600">
            🏬 {d.region === "kr" ? "Kho Hàn" : "Kho VN"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${STATUS_COLOR[d.status] ?? "bg-slate-100 text-slate-600"}`}>
              {d.status}
            </span>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
              <IconXCircle width={20} height={20} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="grid gap-4 p-5 lg:grid-cols-[1.6fr_1fr]">
          {/* LEFT */}
          <div className="space-y-4">
            <Card title="Sản phẩm">
              {items.length === 0 ? (
                <p className="mb-2 rounded-lg border border-dashed border-slate-200 px-3 py-3 text-[13px] text-slate-400">
                  Đơn này chưa ghi món nào. Bấm <b>Thêm món</b> để ghi hàng vào đơn.
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((it, i) => {
                    const known = options.some((o) => o.value === optValue(it));
                    return (
                      <div key={it.lineId ?? `${it.key}-${i}`} className="rounded-lg border border-slate-200 p-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={optValue(it)}
                            onChange={(e) => setProduct(i, e.target.value)}
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-800 outline-none focus:border-blue-400"
                          >
                            {/* Món đã ngừng bán vẫn phải có mặt, không thì <select>
                                tự nhảy sang món đầu danh sách và đơn đổi hàng. */}
                            {!known && (
                              <option value={optValue(it)}>{itemName(it, cat)} (ngừng bán)</option>
                            )}
                            {options.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={it.qty}
                            onChange={(e) => setQty(i, Number(e.target.value))}
                            title="Số lượng"
                            className="w-16 flex-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-[13px] font-medium text-slate-800 outline-none focus:border-blue-400"
                          />
                          {/* Đơn trống thì máy chủ từ chối lưu, nên chặn ngay ở
                              đây thay vì để bấm rồi mới báo lỗi. */}
                          <button
                            onClick={() => removeItem(i)}
                            disabled={items.length < 2}
                            title={
                              items.length < 2
                                ? "Đơn phải còn ít nhất một món — muốn bỏ hẳn thì xoá đơn."
                                : "Bỏ món này khỏi đơn"
                            }
                            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                          >
                            <IconTrash width={16} height={16} />
                          </button>
                        </div>
                        <div className="mt-1 flex justify-between px-0.5 text-[12px] text-slate-400">
                          <span>{money(it.unitPrice)} × {it.qty}</span>
                          <span className="font-medium text-slate-600">{money(it.unitPrice * it.qty)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {options.length > 0 ? (
                <button
                  onClick={addItem}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  <IconPlus width={14} height={14} /> Thêm món
                </button>
              ) : (
                <p className="mt-2 text-[12px] text-amber-700">
                  Danh mục chưa có món nào bán được ở vùng này — vào trang Sản phẩm đặt giá trước.
                </p>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[13px]">
                <span className="text-slate-500">
                  Tiền hàng
                  {itemsDirty && storedGoods !== goods && (
                    <span className="ml-1 text-[12px] text-slate-400 line-through">{money(storedGoods)}</span>
                  )}
                </span>
                <span className="text-[15px] font-semibold text-slate-800">{money(goods)}</span>
              </div>
              {itemsDirty && (
                <p className="mt-1 text-[11.5px] text-amber-700">
                  Bấm <b>Lưu thay đổi</b> mới ghi vào đơn — kho tự trừ/hoàn đúng phần chênh.
                </p>
              )}
              <p className="mt-1 text-[11.5px] text-slate-400">
                Món đã có giữ đơn giá chốt lúc đặt; món mới thêm lấy giá hiện tại trong bảng giá.
                {d.vc ? ` · Mã VC ${d.vc}` : ""}
              </p>
            </Card>

            <Card title="Thanh toán">
              {/* Tổng phải thu cố định — hai ô dưới chỉ chia nhau con số này */}
              <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
                <div className="flex justify-between text-slate-500">
                  <span>Tiền hàng</span>
                  <span className="font-medium text-slate-700">{money(goods)}</span>
                </div>
                <div className="mt-1 flex justify-between text-slate-500">
                  <span>Phí ship khách trả</span>
                  <span className="font-medium text-slate-700">{money(shipFee)}</span>
                </div>
                <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-800">
                  <span>Tổng phải thu</span>
                  <span>{money(total)}</span>
                </div>
              </div>

              <Field label="Đã cọc / trả trước">
                <NumInput value={d.prepaid} onChange={(v) => setSplit("prepaid", v)} />
              </Field>
              <Field label="COD còn phải thu">
                <NumInput value={d.cod} onChange={(v) => setSplit("cod", v)} />
              </Field>
              <p className="px-1 pb-1 text-[11.5px] text-slate-400">
                COD = tổng phải thu − đã cọc. Sửa ô nào thì ô kia tự bù.
              </p>
              <div className="flex justify-between py-1 text-[13px]">
                <span className="text-slate-500">Cước VC trả hãng</span>
                <span className="font-medium text-slate-700">{money(d.cuoc_vc)}</span>
              </div>
              <div className={`mt-2 rounded-lg px-3 py-2 text-[13px] font-medium ${paidFull ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {paidFull ? "✓ Đã thanh toán đủ" : `Cần thu COD ${money(d.cod)}`}
              </div>
            </Card>

            <Card title="Ghi chú">
              <textarea
                value={d.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="Viết ghi chú…"
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-400"
              />
            </Card>

            {/* LỊCH SỬ CẬP NHẬT */}
            <Card title={`Lịch sử cập nhật${history.length ? ` (${history.length})` : ""}`}>
              {history.length === 0 ? (
                <p className="text-[13px] text-slate-400">Chưa có thay đổi nào.</p>
              ) : (
                <ol className="space-y-3">
                  {history.map((h, i) => (
                    <li key={i} className="border-l-2 border-blue-200 pl-3">
                      <div className="text-[12px] text-slate-400">
                        {h.at} · <b className="text-slate-600">{h.by}</b>
                      </div>
                      <ul className="mt-0.5 list-disc pl-4 text-[13px] text-slate-700">
                        {h.changes.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            <Card title="Thông tin">
              <Field label="Trạng thái">
                <select
                  value={d.status}
                  onChange={(e) => set("status", e.target.value as Status)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px]"
                >
                  {ALL_STATUS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="NV chăm sóc">
                <TextInput value={d.assignee ?? "Do"} onChange={(v) => set("assignee", v)} />
              </Field>
              <div className="flex justify-between py-1 text-[13px]">
                <span className="text-slate-500">Tạo lúc</span>
                <span className="font-medium text-slate-700">{d.created ?? "28/09/2025 23:57"}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.tags.length ? (
                  d.tags.map((t) => (
                    <span key={t} className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">{t}</span>
                  ))
                ) : (
                  <span className="text-[12px] text-slate-400">Chưa gắn thẻ</span>
                )}
              </div>
            </Card>

            <Card title="Khách hàng">
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <div className="text-[14px] font-semibold text-slate-800">{d.customer}</div>
                <div className="text-[13px] font-medium text-blue-600">{d.phone}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[12px]">
                  <div>Tổng chi: <b className="text-slate-800">{money(total)}</b></div>
                  <div>Thành công: <b className="text-emerald-600">{d.successOrders ?? "1/1 đơn"}</b></div>
                  <div className="col-span-2">Lần mua cuối: <b className="text-slate-700">{d.lastBuy ?? "10:50 01/10/2025"}</b></div>
                </div>
              </div>
            </Card>

            <Card title="Nhận hàng">
              <Field label="Người nhận">
                <TextInput value={d.recipient} onChange={(v) => set("recipient", v)} />
              </Field>
              <Field label="SĐT">
                <TextInput value={d.phone} onChange={(v) => set("phone", v)} />
              </Field>
              <Field label="Địa chỉ">
                <TextInput value={d.address} onChange={(v) => set("address", v)} />
              </Field>
              <Field label="ĐVVC">
                <select
                  value={d.carrier}
                  onChange={(e) => set("carrier", e.target.value as OrderRow["carrier"])}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px]"
                >
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>{c || "—"}</option>
                  ))}
                </select>
              </Field>
              <Field label="Dự kiến nhận">
                <input
                  type="date"
                  value={d.expected ?? ""}
                  onChange={(e) => set("expected", e.target.value)}
                  className="w-48 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-[13px] text-slate-800 outline-none focus:border-blue-400"
                />
              </Field>
            </Card>
          </div>
        </div>

        {/* footer */}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-4 rounded-b-2xl border-t border-slate-200 bg-white px-5 py-3">
          <div className="text-[13px] text-slate-600">Tiền cần thu: <b className="text-slate-900">{money(d.cod)}</b></div>
          <div className="text-[13px] text-slate-600">COD: <b className={d.cod ? "text-rose-600" : "text-slate-900"}>{money(d.cod)}</b></div>
          {saved && <span className="text-[13px] font-medium text-emerald-600">✓ Đã lưu</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">
              Đóng
            </button>
            <button onClick={handleSave} className="rounded-lg bg-blue-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-blue-700">
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-[13px] font-semibold text-slate-800">{title}</h4>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="flex-none text-slate-500">{label}</span>
      {children}
    </div>
  );
}
function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-48 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-[13px] text-slate-800 outline-none focus:border-blue-400"
    />
  );
}
function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-40 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-[13px] font-medium text-slate-800 outline-none focus:border-blue-400"
    />
  );
}
