import type { Region, Currency } from "./types";

// Định dạng tiền theo vùng người đặt (§5). Tính toán luôn trên integer.
export function formatMoney(value: number, region: Region): string {
  const v = Math.round(value);
  return region === "vn"
    ? v.toLocaleString("vi-VN") + "đ"
    : "₩" + v.toLocaleString("en-US");
}

export const currencyOf = (region: Region): Currency =>
  region === "vn" ? "vnd" : "krw";

/**
 * Quy đổi phí kho (local currency) về tiền tệ người đặt qua fx_rate snapshot (§6).
 * fxKrwVnd = số VND cho 1 KRW.
 */
export function convertToBuyerCurrency(
  amount: number,
  whCurrency: Currency,
  buyerRegion: Region,
  fxKrwVnd: number,
): number {
  const buyerCur = currencyOf(buyerRegion);
  if (whCurrency === buyerCur) return amount;
  const toKrw = whCurrency === "vnd" ? amount / fxKrwVnd : amount;
  return buyerRegion === "vn" ? toKrw * fxKrwVnd : toKrw;
}
