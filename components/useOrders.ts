"use client";

import { useCallback, useEffect, useState } from "react";
import { ORDERS, type OrderRow } from "@/lib/ordersMock";
import { displayTime, idFromKey, type StoredOrder } from "@/lib/orders/orderSchema";
import type { HistoryEntry } from "@/components/OrderDetailModal";

// ============================================================================
// Nguồn dữ liệu đơn dùng chung cho Đơn hàng / Khách hàng / Thu chi.
//
// Trước đây mỗi trang tự đọc localStorage một kiểu nên số liệu lệch nhau:
// trang Khách hàng sửa đơn mà không ghi lại vào kho đơn, trang Thu chi thì bỏ
// qua phần đã sửa nên doanh thu hiển thị sai. Gom về một chỗ là hết.
//
// Hai chế độ:
//   "db"   — đã nối cơ sở dữ liệu, mọi thao tác đi qua API.
//   "seed"  — chưa nối, chạy bằng đơn mẫu + localStorage như cũ để xem thử.
// Lỗi đọc dữ liệu KHÔNG rơi về đơn mẫu — phải báo lỗi, không thì anh tưởng
// không có khách nào đặt.
// ============================================================================

const HISTORY_KEY = "tr_order_history";
const EDITS_KEY = "tr_order_edits";
const NEW_KEY = "tr_order_new";
const API = "/api/dashboard/orders";

export type OrderSourceMode = "db" | "seed";

export interface UseOrders {
  rows: OrderRow[];
  history: Record<number, HistoryEntry[]>;
  source: OrderSourceMode;
  loading: boolean;
  error: string;
  needLogin: boolean;
  refresh: () => void;
  saveOrder: (order: OrderRow, changes: string[]) => Promise<boolean>;
  addOrder: (payload: Omit<OrderRow, "id">) => Promise<OrderRow | null>;
  removeOrders: (ids: number[]) => Promise<boolean>;
}

const readLS = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeLS = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* hết dung lượng — bỏ qua */
  }
};

export const stamp = () => {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`;
};

export function useOrders(): UseOrders {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [history, setHistory] = useState<Record<number, HistoryEntry[]>>({});
  const [source, setSource] = useState<OrderSourceMode>("seed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);

  /** Chế độ xem thử: đơn mẫu + đơn tạo tay/đơn web lưu trên máy này. */
  const loadLocal = useCallback(() => {
    const created = readLS<OrderRow[]>(NEW_KEY, []);
    const edits = readLS<Record<number, OrderRow>>(EDITS_KEY, {});
    setRows([...created, ...ORDERS].map((r) => edits[r.id] ?? r));
    setHistory(readLS<Record<number, HistoryEntry[]>>(HISTORY_KEY, {}));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (res.status === 401) {
        setNeedLogin(true);
        setRows([]);
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        source?: OrderSourceMode;
        rows?: StoredOrder[];
        history?: { at: string; rowKey: string; by: string; changes: string[] }[];
      };

      if (!data.ok) {
        // Đã nối cơ sở dữ liệu mà lỗi → báo thẳng, tuyệt đối không hiện đơn mẫu.
        setError(data.error ?? "Không đọc được đơn hàng.");
        setRows([]);
        return;
      }

      if (data.source === "db") {
        setSource("db");
        // Giờ tạo đơn phải định dạng Ở ĐÂY, không phải ở máy chủ: máy chủ Vercel
        // chạy giờ UTC nên đơn đặt 22h tối giờ Việt Nam sẽ hiện thành 15h.
        // Client định dạng theo đúng múi giờ của máy anh đang mở.
        setRows(
          (data.rows ?? []).map((r) =>
            r.createdAtIso ? { ...r, created: displayTime(r.createdAtIso) } : r,
          ),
        );
        const h: Record<number, HistoryEntry[]> = {};
        for (const e of data.history ?? []) {
          const id = idFromKey(e.rowKey);
          (h[id] ??= []).unshift({ at: e.at, by: e.by, changes: e.changes });
        }
        setHistory(h);
      } else {
        setSource("seed");
        loadLocal();
      }
    } catch {
      setError("Mất kết nối tới máy chủ.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [loadLocal]);

  useEffect(() => {
    void load();
  }, [load]);

  // Quay lại tab thì tải lại — nhiều máy cùng dùng nên số liệu phải mới.
  useEffect(() => {
    if (source !== "db") return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [source, load]);

  const rowKeyOf = useCallback(
    (id: number) => (rows.find((r) => r.id === id) as StoredOrder | undefined)?.rowKey,
    [rows],
  );

  // ------------------------------------------------------------------ sửa đơn
  const saveOrder = useCallback(
    async (order: OrderRow, changes: string[]): Promise<boolean> => {
      // Cập nhật ngay trên màn cho mượt, hỏng thì tải lại về đúng.
      //
      // Giữ lại `items` đang có nếu lần lưu này không đụng tới hàng: popup chỉ
      // gửi kèm hàng khi anh thật sự sửa, nên ghi đè thẳng là sửa ghi chú xong
      // dòng hàng của đơn biến mất khỏi màn cho tới lần tải lại sau.
      setRows((rs) =>
        rs.map((r) =>
          r.id === order.id
            ? {
                ...order,
                items: (order as StoredOrder).items ?? (r as StoredOrder).items,
              }
            : r,
        ),
      );
      if (changes.length) {
        setHistory((h) => ({
          ...h,
          [order.id]: [{ at: stamp(), by: "Bạn", changes }, ...(h[order.id] ?? [])],
        }));
      }

      if (source === "seed") {
        const edits = readLS<Record<number, OrderRow>>(EDITS_KEY, {});
        edits[order.id] = order;
        writeLS(EDITS_KEY, edits);
        const created = readLS<OrderRow[]>(NEW_KEY, []);
        const i = created.findIndex((o) => o.id === order.id);
        if (i >= 0) {
          created[i] = order;
          writeLS(NEW_KEY, created);
        }
        const h = readLS<Record<number, HistoryEntry[]>>(HISTORY_KEY, {});
        if (changes.length) h[order.id] = [{ at: stamp(), by: "Bạn", changes }, ...(h[order.id] ?? [])];
        writeLS(HISTORY_KEY, h);
        return true;
      }

      const rowKey = (order as StoredOrder).rowKey ?? rowKeyOf(order.id);
      if (!rowKey) {
        setError("Không xác định được đơn cần sửa. Tải lại trang giúp em.");
        return false;
      }
      try {
        const res = await fetch(API, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rowKey, patch: order, changes }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) {
          setError(data.error ?? "Không lưu được lên cơ sở dữ liệu.");
          void load();
          return false;
        }
        // Sửa hàng trong đơn thì MÁY CHỦ mới là bên chốt: giá món mới, tiền hàng,
        // tóm tắt và mã dòng hàng đều do nó tính. Tải lại để màn hình mang đúng
        // những con số đã ghi, không phải bản đoán trước của trình duyệt.
        if ((order as StoredOrder).items) void load();
        return true;
      } catch {
        setError("Mất kết nối khi lưu. Tải lại trang để xem trạng thái thật.");
        void load();
        return false;
      }
    },
    [source, rowKeyOf, load],
  );

  // ----------------------------------------------------------------- tạo đơn
  const addOrder = useCallback(
    async (payload: Omit<OrderRow, "id">): Promise<OrderRow | null> => {
      if (source === "seed") {
        const created = readLS<OrderRow[]>(NEW_KEY, []);
        const id = Math.max(1000, ...ORDERS.map((o) => o.id), ...created.map((o) => o.id)) + 1;
        const order: OrderRow = { id, ...payload, created: payload.created ?? stamp() };
        writeLS(NEW_KEY, [order, ...created]);
        setRows((rs) => [order, ...rs]);
        const h = readLS<Record<number, HistoryEntry[]>>(HISTORY_KEY, {});
        h[id] = [{ at: stamp(), by: "Bạn", changes: ["Tạo đơn mới"] }];
        writeLS(HISTORY_KEY, h);
        setHistory((prev) => ({ ...prev, [id]: h[id] }));
        return order;
      }

      // Mã đơn do MÁY CHỦ cấp. Trước đây chỗ này tự chế `TAY-XXXXXX` ở trình
      // duyệt: đơn tạo tay mang mã khác hẳn đơn khách đặt, và từ §0020 thì ghi
      // tay vào cột sinh tự động là Postgres từ chối cả câu INSERT.
      const parcel = {
        ...payload,
        parcelIndex: 1,
        parcelCount: 1,
        currency: payload.region === "vn" ? "vnd" : "krw",
        fx: 18.5,
        recipientPhone: payload.phone,
      };
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ parcels: [parcel] }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string; rowKeys?: string[] };
        if (!data.ok) {
          setError(data.error ?? "Không tạo được đơn.");
          return null;
        }
        await load();
        const key = data.rowKeys?.[0];
        return key ? { ...payload, id: idFromKey(key) } : null;
      } catch {
        setError("Mất kết nối khi tạo đơn.");
        return null;
      }
    },
    [source, load],
  );

  // ------------------------------------------------------------------ xoá đơn
  const removeOrders = useCallback(
    async (ids: number[]): Promise<boolean> => {
      const keys = ids.map((id) => rowKeyOf(id)).filter(Boolean) as string[];
      setRows((rs) => rs.filter((r) => !ids.includes(r.id)));

      if (source === "seed") {
        const edits = readLS<Record<number, OrderRow>>(EDITS_KEY, {});
        ids.forEach((id) => delete edits[id]);
        writeLS(EDITS_KEY, edits);
        writeLS(
          NEW_KEY,
          readLS<OrderRow[]>(NEW_KEY, []).filter((o) => !ids.includes(o.id)),
        );
        return true;
      }

      if (!keys.length) return true;
      try {
        const res = await fetch(API, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rowKeys: keys }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) {
          setError(data.error ?? "Không xoá được đơn.");
          void load();
          return false;
        }
        return true;
      } catch {
        setError("Mất kết nối khi xoá.");
        void load();
        return false;
      }
    },
    [source, rowKeyOf, load],
  );

  return {
    rows,
    history,
    source,
    loading,
    error,
    needLogin,
    refresh: () => void load(),
    saveOrder,
    addOrder,
    removeOrders,
  };
}
