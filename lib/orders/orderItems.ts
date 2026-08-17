import type { Region } from "@/lib/types";
import {
  boxBasePrice,
  comboOptions,
  comboPrice,
  flavorRetailPrice,
  type Catalog,
} from "@/lib/pricing";

// ============================================================================
// Hàng nằm trong MỘT KIỆN — đọc, đặt tên, tính giá.
//
// Thuần, không chạm database, nên dùng chung được cả ở popup chi tiết (trình
// duyệt) lẫn lúc lưu (máy chủ). Hai bên tính khác nhau là kiểu lỗi khó thấy
// nhất: màn hình hiện một con số, database lưu một con số khác.
//
// Khoá món (`key`) dùng ĐÚNG quy ước của tồn kho — `combo:<id>` / `box:<id>` /
// `flavor:<id>` — nên sửa hàng trong đơn là trừ/hoàn kho được ngay, không phải
// tự chế thêm một hệ khoá thứ hai.
// ============================================================================

export type ItemKind = "combo" | "box" | "flavor";

export interface OrderItem {
  /**
   * `order_line.id` của dòng đang có trong database.
   *
   * Có id thì sửa đúng dòng đó và GIỮ NGUYÊN đơn giá đã chốt lúc khách đặt —
   * bảng giá đổi sau đó không được phép làm đơn cũ dày lên hay mỏng đi. Không
   * có id là món vừa thêm, giá lấy từ bảng giá hiện tại.
   */
  lineId?: string;
  key: string;
  /** Lựa chọn nhân của set (VD "Nhân cổ truyền cao cấp") — quyết định giá. */
  variant?: string;
  qty: number;
  unitPrice: number;
}

/** `combo:<uuid>` → { kind, id }. Trả null nếu khoá không hợp lệ. */
export function splitKey(key: string): { kind: ItemKind; id: string } | null {
  const i = key.indexOf(":");
  if (i < 1) return null;
  const kind = key.slice(0, i);
  const id = key.slice(i + 1);
  if (!id) return null;
  if (kind !== "combo" && kind !== "box" && kind !== "flavor") return null;
  return { kind, id };
}

/**
 * Tên món để hiện trên màn và ghi vào tóm tắt đơn.
 *
 * Tra trong danh mục ĐẦY ĐỦ (kể cả hàng đã tắt bán), vì đơn cũ hoàn toàn có thể
 * chứa món shop đã ngừng bán. Tra không ra mới đành ghi "Món đã xoá" — nhưng
 * vẫn giữ dòng đó lại, không giấu đi: giấu là đơn tự nhiên nhẹ tiền đi.
 */
export function itemName(item: Pick<OrderItem, "key" | "variant">, cat: Catalog): string {
  const p = splitKey(item.key);
  if (!p) return "Món đã xoá";
  if (p.kind === "combo") {
    const c = cat.combos.find((x) => x.id === p.id);
    if (!c) return "Set đã xoá";
    return item.variant ? `${c.name} · ${item.variant}` : c.name;
  }
  if (p.kind === "box") return cat.boxes.find((x) => x.id === p.id)?.name ?? "Hộp đã xoá";
  const f = cat.flavors.find((x) => x.id === p.id);
  return f ? `${f.name} (lẻ)` : "Vị đã xoá";
}

/**
 * Giá niêm yết HIỆN TẠI của một món, theo tiền tệ người đặt.
 *
 * Chỉ dùng cho món MỚI THÊM vào đơn. Món đã có sẵn giữ giá chốt lúc đặt (xem
 * `OrderItem.lineId`).
 *
 * Trả `null` khi món không còn trong danh mục hoặc chưa đặt giá ở vùng này —
 * chỗ gọi phải báo lỗi, tuyệt đối đừng lấy 0 làm giá.
 */
export function itemPrice(
  item: Pick<OrderItem, "key" | "variant">,
  cat: Catalog,
  buyer: Region,
): number | null {
  const p = splitKey(item.key);
  if (!p) return null;

  if (p.kind === "combo") {
    const c = cat.combos.find((x) => x.id === p.id);
    if (!c) return null;
    const opts = comboOptions(c, buyer);
    if (opts.length) {
      // Set nhiều lựa chọn nhân: giá theo ĐÚNG lựa chọn. Không biết lựa chọn nào
      // thì lấy giá thấp nhất — cùng cách trang bán hiện "từ ...".
      const picked = item.variant ? opts.find((o) => o.name === item.variant) : undefined;
      return picked ? picked.price : Math.min(...opts.map((o) => o.price));
    }
    return comboPrice(c, cat.boxes, cat.flavors, buyer);
  }

  if (p.kind === "box") {
    const b = cat.boxes.find((x) => x.id === p.id);
    // Giá phẳng theo size, chưa gồm phụ thu vị — hộp trong `consume` không mang
    // theo danh sách vị nào.
    return b ? boxBasePrice(b, buyer) || null : null;
  }

  const f = cat.flavors.find((x) => x.id === p.id);
  return f ? flavorRetailPrice(f, buyer) || null : null;
}

/** Tóm tắt hàng của kiện: "Sắc Đỏ ×2, Trà xanh (lẻ)". */
export function describeItems(items: OrderItem[], cat: Catalog): string {
  return items
    .filter((i) => i.qty > 0)
    .map((i) => `${itemName(i, cat)}${i.qty > 1 ? ` ×${i.qty}` : ""}`)
    .join(", ");
}

/** Tiêu hao kho của kiện: khoá món → tổng số lượng. */
export function itemsToConsume(items: OrderItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    if (!splitKey(i.key) || i.qty <= 0) continue;
    out[i.key] = (out[i.key] ?? 0) + i.qty;
  }
  return out;
}

export const itemsGoods = (items: OrderItem[]): number =>
  items.reduce((s, i) => s + i.unitPrice * Math.max(0, i.qty), 0);

/**
 * Dựng danh sách hàng cho kiện CHƯA CÓ dòng `order_line`.
 *
 * Đơn tạo tay ở bảng điều hành đi thẳng vào `shipment`, không sinh dòng hàng —
 * chỗ duy nhất còn ghi lại nó mua gì là `consume`. Mà `consume` chỉ có số lượng,
 * không có giá.
 *
 * Giá lấy từ BẢNG GIÁ HIỆN TẠI, cố ý giống hệt cách máy chủ tính lúc lưu: món
 * không có `lineId` thì cả hai bên đều tra danh mục. Lệch nhau ở đây là màn hình
 * hiện một con số rồi lưu xuống một con số khác — kiểu sai khó cãi nhất.
 *
 * Tra không ra giá (món đã xoá) thì mới suy ngược từ tiền hàng đã chốt, và chỉ
 * suy được khi kiện có đúng một món — đơn tạo tay luôn rơi vào trường hợp đó vì
 * form tạo đơn chỉ cho chọn một món. Lưu lại thì máy chủ báo lỗi bảo đặt giá, chứ
 * không lặng lẽ tính 0đ.
 *
 * Suy ra giá KHÔNG tự làm đơn đổi tiền: popup chỉ tính lại tổng khi anh thật sự
 * sửa hàng (xem `OrderDetailModal`).
 */
export function itemsFromConsume(
  consume: Record<string, number> | undefined,
  goodsAmount: number,
  cat: Catalog,
  buyer: Region,
): OrderItem[] {
  const entries = Object.entries(consume ?? {}).filter(([k, n]) => splitKey(k) && n > 0);
  if (!entries.length) return [];

  return entries.map(([key, qty]) => {
    const listed = itemPrice({ key }, cat, buyer);
    const derived = entries.length === 1 && goodsAmount > 0 ? Math.round(goodsAmount / qty) : 0;
    return { key, qty, unitPrice: listed ?? derived };
  });
}
