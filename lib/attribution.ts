// ============================================================================
// Định danh khách qua token ?ref (demo, localStorage).
// Mô phỏng bảng order_links: token → {psid, khách, pancake_customer_id}.
// Bản thật: lưu ở Supabase (order_links) + đọc PSID/pancake_customer_id từ
// Pancake Chat API khi gửi link trong Messenger (§10.1).
// ============================================================================

export const LINKS_KEY = "tr_order_links";

export interface OrderLink {
  token: string;
  customerName: string; // tên khách trên Messenger
  psid: string; // Page-Scoped ID (định danh khách với Page)
  phone?: string;
  pancakeCustomerId?: string;
  createdAt: number;
  usedByOrder?: string; // mã đơn đã dùng token này
}

export function getLinks(): OrderLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LINKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLinks(list: OrderLink[]) {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(list));
    window.dispatchEvent(new StorageEvent("storage", { key: LINKS_KEY }));
  } catch {
    /* ignore */
  }
}

// token dạng fb-<mã> để dễ nhận ra nguồn
export function genToken(): string {
  return `fb-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function addLink(input: { customerName: string; psid: string; phone?: string; pancakeCustomerId?: string }): OrderLink {
  const link: OrderLink = {
    token: genToken(),
    customerName: input.customerName.trim() || "Khách Messenger",
    psid: input.psid.trim() || `psid_${Math.random().toString(36).slice(2, 10)}`,
    phone: input.phone?.trim() || undefined,
    pancakeCustomerId: input.pancakeCustomerId?.trim() || `pck_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  saveLinks([link, ...getLinks()]);
  return link;
}

export function findLink(token?: string): OrderLink | undefined {
  if (!token) return undefined;
  return getLinks().find((l) => l.token === token);
}

// đánh dấu token đã tạo ra đơn nào (mô phỏng order_links.used = true)
export function markUsed(token: string, orderCode: string) {
  const list = getLinks();
  const i = list.findIndex((l) => l.token === token);
  if (i < 0) return;
  list[i] = { ...list[i], usedByOrder: orderCode };
  saveLinks(list);
}

export function removeLink(token: string) {
  saveLinks(getLinks().filter((l) => l.token !== token));
}
