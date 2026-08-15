// ============================================================================
// Chuyển danh sách đơn ở Dashboard thành sheet Excel.
// Tiền giữ nguyên tiền tệ của kho (VN → đ, Hàn → ₩) và có thêm một cột quy đổi
// về đơn vị đang chọn để cộng tổng được trong Excel.
// ============================================================================
import type { OrderRow, Status } from "./ordersMock";
import type { SheetSpec } from "./xlsx";

export type ExportCurrency = "krw" | "vnd";

/** Trạng thái không tính vào doanh thu (giống quy ước hoàn kho ở bảng đơn). */
const VOIDED = new Set<Status>(["Huỷ đơn", "Khách trả lại", "Đã hoàn toàn bộ"]);

const SOURCE_LABEL: Record<OrderRow["source"], string> = {
  web: "Online",
  facebook: "Facebook",
  pos: "Tại quầy",
};

const WAREHOUSE_LABEL = { vn: "Kho VN", kr: "Kho Hàn" } as const;
const CURRENCY_LABEL = { vn: "VND", kr: "KRW" } as const;

/** Quy đổi tiền của một dòng (đang ở tiền tệ kho) về đơn vị hiển thị đang chọn. */
export function convertRowMoney(
  amount: number,
  region: OrderRow["region"],
  to: ExportCurrency,
  fx: number,
): number {
  const krw = region === "kr" ? amount : amount / fx;
  return Math.round(to === "krw" ? krw : krw * fx);
}

export interface ExportOptions {
  cur: ExportCurrency;
  fx: number;
  /** Mô tả bộ lọc đang áp dụng, ghi vào sheet Tổng hợp để biết file này là lát cắt nào. */
  filterNote?: string;
}

export function ordersToSheets(rows: OrderRow[], opts: ExportOptions): SheetSpec[] {
  const { cur, fx } = opts;
  const curLabel = cur === "krw" ? "KRW" : "VND";

  const detail: SheetSpec = {
    name: "Đơn hàng",
    columns: [
      { header: "Mã đơn", width: 9 },
      { header: "Ngày tạo", width: 16 },
      { header: "Nguồn", width: 10 },
      { header: "Trạng thái", width: 15 },
      { header: "Khách đặt", width: 20 },
      { header: "SĐT", width: 14 },
      { header: "Người nhận", width: 20 },
      { header: "Địa chỉ", width: 34 },
      { header: "Kho", width: 10 },
      { header: "Sản phẩm", width: 30 },
      { header: "Ngày muốn nhận", width: 14 },
      { header: "Mã vận chuyển", width: 15 },
      { header: "ĐVVC", width: 12 },
      { header: "Tiền tệ", width: 8 },
      { header: "Trả trước", width: 12, money: true },
      { header: "COD", width: 11, money: true },
      { header: "Cước VC", width: 11, money: true },
      { header: "Phí VC thu khách", width: 15, money: true },
      { header: `Doanh thu quy đổi (${curLabel})`, width: 18, money: true },
      { header: "Nhãn", width: 14 },
      { header: "Ghi chú", width: 34 },
    ],
    rows: rows.map((r) => [
      r.id,
      r.created ?? "",
      SOURCE_LABEL[r.source],
      r.status,
      r.customer,
      // để dạng chữ, không thì Excel ăn mất số 0 đứng đầu
      r.phone,
      r.recipient,
      r.address,
      WAREHOUSE_LABEL[r.region],
      r.product ?? "",
      r.expected ?? "",
      r.vc,
      r.carrier,
      CURRENCY_LABEL[r.region],
      r.prepaid,
      r.cod,
      r.cuoc_vc,
      r.phi_vc_thu_khach,
      convertRowMoney(r.prepaid + r.cod, r.region, cur, fx),
      r.tags.join(", "),
      r.note,
    ]),
  };

  // ---- sheet tổng hợp ----
  // Đơn huỷ / khách trả lại / đã hoàn tiền KHÔNG tính vào doanh thu — tách riêng
  // để con số mang sang kế toán dùng được ngay.
  const amountOf = (r: OrderRow) => convertRowMoney(r.prepaid + r.cod, r.region, cur, fx);
  const live = rows.filter((r) => !VOIDED.has(r.status));
  const voided = rows.filter((r) => VOIDED.has(r.status));
  const sum = (list: OrderRow[]) => list.reduce((s, r) => s + amountOf(r), 0);

  const byStatus = new Map<string, { n: number; money: number }>();
  for (const r of rows) {
    const cell = byStatus.get(r.status) ?? { n: 0, money: 0 };
    cell.n += 1;
    cell.money += amountOf(r);
    byStatus.set(r.status, cell);
  }

  const summary: SheetSpec = {
    name: "Tổng hợp",
    columns: [
      { header: "Chỉ số", width: 30 },
      { header: "Số kiện", width: 12 },
      { header: `Tiền (${curLabel})`, width: 18, money: true },
    ],
    rows: [
      ["Doanh thu (không tính huỷ/trả/hoàn)", live.length, sum(live)],
      ["Đơn huỷ · trả lại · hoàn tiền", voided.length, sum(voided)],
      ["Tổng số kiện đã xuất", rows.length, sum(rows)],
      [null, null, null],
      ["Kho VN", rows.filter((r) => r.region === "vn").length, sum(rows.filter((r) => r.region === "vn"))],
      ["Kho Hàn", rows.filter((r) => r.region === "kr").length, sum(rows.filter((r) => r.region === "kr"))],
      [null, null, null],
      ["— Theo trạng thái —", null, null],
      ...[...byStatus.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([status, v]) => [status, v.n, v.money] as (string | number)[]),
      [null, null, null],
      ["Tỉ giá dùng để quy đổi", `1 KRW = ${fx} VND`, null],
      ["Bộ lọc khi xuất", opts.filterNote ?? "Tất cả", null],
      ["Xuất lúc", stamp(), null],
    ],
  };

  return [detail, summary];
}

function stamp() {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Tên file gợi ý: DoranKing-DonHang-20260814-0930.xlsx */
export function exportFileName(prefix = "DonHang") {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `DoranKing-${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
}
