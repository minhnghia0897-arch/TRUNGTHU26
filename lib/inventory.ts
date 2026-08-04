// ============================================================================
// Mô hình tồn kho theo THÀNH PHẦN (BOM). Đơn vị kho nguyên tử = vỏ hộp + bánh.
// Set/combo KHÔNG có tồn riêng — tính từ định mức. Số dưới đây là ví dụ để
// anh tính toán; bản thật đọc mirror từ Pancake (§15).
// ============================================================================

export interface StockItem {
  key: string;
  name: string;
  unit: string; // vỏ / bánh
  qty: number;
  threshold: number; // ngưỡng cảnh báo
}

// --- Kho vỏ hộp ---
export const VO: StockItem[] = [
  { key: "vo-gam", name: "Vỏ hộp gấm 6 vị", unit: "vỏ", qty: 120, threshold: 30 },
  { key: "vo-doanvien", name: "Vỏ hộp Đoàn Viên", unit: "vỏ", qty: 24, threshold: 30 },
];

// --- Kho bánh (mỗi vị 1 SKU) ---
export const BANH: StockItem[] = [
  { key: "b-thapcam", name: "Bánh thập cẩm 150g", unit: "bánh", qty: 200, threshold: 40 },
  { key: "b-sen", name: "Bánh sen trứng 150g", unit: "bánh", qty: 210, threshold: 40 },
  { key: "b-traxanh", name: "Bánh trà xanh 150g", unit: "bánh", qty: 150, threshold: 40 },
  { key: "b-daudo", name: "Bánh đậu đỏ 150g", unit: "bánh", qty: 180, threshold: 40 },
  { key: "b-vica", name: "Bánh vi cá 150g", unit: "bánh", qty: 40, threshold: 40 },
  { key: "b-yen", name: "Bánh yến sào 150g", unit: "bánh", qty: 0, threshold: 40 },
];

export const ALL_STOCK: StockItem[] = [...VO, ...BANH];

// --- Định mức (BOM) mỗi set: 1 vỏ + các bánh ---
export interface SetBOM {
  key: string;
  name: string;
  voKey: string;
  cakes: { key: string; qty: number }[];
}
export const SETS: SetBOM[] = [
  {
    key: "set-gam6", name: "Hộp gấm 6 vị", voKey: "vo-gam",
    cakes: [
      { key: "b-thapcam", qty: 1 }, { key: "b-sen", qty: 1 }, { key: "b-traxanh", qty: 1 },
      { key: "b-daudo", qty: 1 }, { key: "b-vica", qty: 1 }, { key: "b-yen", qty: 1 },
    ],
  },
  {
    key: "set-doanvien", name: "Set Đoàn Viên", voKey: "vo-doanvien",
    cakes: [
      { key: "b-thapcam", qty: 1 }, { key: "b-sen", qty: 1 }, { key: "b-traxanh", qty: 1 }, { key: "b-daudo", qty: 1 },
    ],
  },
];

export const nameOf = (key: string) => ALL_STOCK.find((s) => s.key === key)?.name ?? key;

// Tồn set khả dụng = min(vỏ, ⌊bánh_i / sl_i⌋). Trả kèm thành phần giới hạn.
export function availableSet(set: SetBOM, qtyOf: (k: string) => number): { count: number; bottleneck: string } {
  let count = qtyOf(set.voKey);
  let bottleneck = "Vỏ hộp";
  for (const c of set.cakes) {
    const n = Math.floor(qtyOf(c.key) / c.qty);
    if (n < count) {
      count = n;
      bottleneck = nameOf(c.key);
    }
  }
  return { count: Math.max(0, count), bottleneck };
}
