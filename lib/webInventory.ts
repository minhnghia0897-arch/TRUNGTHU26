// ============================================================================
// Cầu nối catalog (web) ↔ kho (BOM): quy 1 dòng giỏ web về tiêu hao SKU kho.
// Catalog dùng id f1..f6 / seed-*, kho dùng key vo-* / b-*. Map tường minh ở đây.
// Bản thật: hai bên trỏ chung một SKU trong Supabase, không cần map.
// ============================================================================

export const BOX_TO_SHELL: Record<string, string> = {
  "seed-box6": "vo-gam",
  "seed-set": "vo-doanvien",
};

export const FLAVOR_TO_CAKE: Record<string, string> = {
  f1: "b-thapcam",
  f2: "b-sen",
  f3: "b-traxanh",
  f4: "b-daudo",
  f5: "b-vica",
  f6: "b-yen",
};

export interface WebCartLine {
  kind: "box" | "combo" | "la";
  boxId?: string;
  flavorIds?: string[];
  qty: number;
}

/** Tổng tiêu hao kho cho cả giỏ web: hộp/combo = 1 vỏ + các vị; lẻ = vị đó. */
export function cartConsume(lines: WebCartLine[]): Record<string, number> {
  const c: Record<string, number> = {};
  const add = (key: string | undefined, n: number) => {
    if (!key || n <= 0) return;
    c[key] = (c[key] ?? 0) + n;
  };
  for (const l of lines) {
    const qty = Math.max(1, Math.floor(l.qty || 1));
    if (l.kind === "la") {
      add(FLAVOR_TO_CAKE[l.flavorIds?.[0] ?? ""], qty);
    } else {
      add(BOX_TO_SHELL[l.boxId ?? ""], qty); // 1 vỏ / hộp
      for (const fid of l.flavorIds ?? []) add(FLAVOR_TO_CAKE[fid], qty);
    }
  }
  return c;
}
