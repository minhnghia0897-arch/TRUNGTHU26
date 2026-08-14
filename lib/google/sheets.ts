import { getServiceToken, isServiceAccountConfigured } from "./serviceAccount";

// ============================================================================
// Lớp mỏng gọi Google Sheets API v4 bằng service account.
//
// CHỈ DÙNG Ở SERVER. Không import file này từ component "use client" —
// nó cầm key của service account. (Đừng lẫn với lib/googleDrive.ts: file kia
// chạy ở trình duyệt, xin quyền của người đang mở web.)
// ============================================================================

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Đọc env trong hàm, không phải lúc load module — để build preview không nổ. */
export const sheetId = () => process.env.GOOGLE_SHEET_ID?.trim() ?? "";

export const isSheetsConfigured = () => Boolean(sheetId() && isServiceAccountConfigured());

export class SheetsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SheetsError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, init?: RequestInit, attempt = 1): Promise<T> {
  const token = await getServiceToken(SCOPE);
  const res = await fetch(`${API}/${sheetId()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });

  if (res.ok) return (await res.json()) as T;

  // 429 / 5xx là lỗi tạm — thử lại có giãn cách, tôn trọng Retry-After nếu có
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt);
    return call<T>(path, init, attempt + 1);
  }

  let detail = "";
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    detail = j.error?.message ?? "";
  } catch {
    /* body không phải JSON */
  }
  throw new SheetsError(
    `Google Sheets lỗi ${res.status}${detail ? `: ${detail}` : ""}`,
    res.status,
  );
}

/** Bọc tên tab có dấu cách / dấu tiếng Việt: Đơn hàng!A:AE → 'Đơn hàng'!A:AE */
export const a1 = (tab: string, range: string) => `'${tab.replace(/'/g, "''")}'!${range}`;

const enc = (range: string) => encodeURIComponent(range);

export type Cell = string | number | boolean | null;

interface ValueRange {
  range?: string;
  values?: Cell[][];
}

/** Đọc một vùng. Sheets bỏ trống các ô cuối dòng nên mảng trả về có thể lởm chởm. */
export async function getValues(range: string): Promise<Cell[][]> {
  const r = await call<ValueRange>(
    `/values/${enc(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  return r.values ?? [];
}

/** Đọc nhiều vùng trong MỘT request (tiết kiệm quota). */
export async function batchGetValues(ranges: string[]): Promise<Cell[][][]> {
  if (!ranges.length) return [];
  const qs = ranges.map((r) => `ranges=${enc(r)}`).join("&");
  const r = await call<{ valueRanges?: ValueRange[] }>(
    `/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  return (r.valueRanges ?? []).map((v) => v.values ?? []);
}

export interface AppendResult {
  /** Vùng thực sự được ghi, vd 'Đơn hàng'!A25:AE26 */
  updatedRange: string;
  updatedRows: number;
}

/**
 * Chèn thêm dòng vào cuối bảng. Sheets tự tìm dòng trống cuối và chèn — thao tác
 * này ATOMIC ở phía Google, nên hai khách đặt cùng lúc không ghi đè nhau.
 * RAW = giữ nguyên chuỗi: SĐT "01055861555" không bị ăn số 0, "+82…" không thành công thức.
 */
export async function appendValues(range: string, rows: Cell[][]): Promise<AppendResult> {
  const r = await call<{ updates?: { updatedRange?: string; updatedRows?: number } }>(
    `/values/${enc(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
    { method: "POST", body: JSON.stringify({ values: rows }) },
  );
  return {
    updatedRange: r.updates?.updatedRange ?? "",
    updatedRows: r.updates?.updatedRows ?? 0,
  };
}

/** Ghi đè nhiều vùng rời rạc trong một request. */
export async function batchUpdateValues(data: { range: string; values: Cell[][] }[]) {
  if (!data.length) return;
  await call(`/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
}

// ------------------------------------------------------------ cấu trúc bảng
interface SheetProps {
  properties?: { title?: string; sheetId?: number; gridProperties?: { rowCount?: number } };
}

export async function listTabs(): Promise<{ title: string; id: number; rows: number }[]> {
  const r = await call<{ sheets?: SheetProps[] }>(
    `?fields=sheets.properties(title,sheetId,gridProperties.rowCount)`,
  );
  return (r.sheets ?? []).map((s) => ({
    title: s.properties?.title ?? "",
    id: s.properties?.sheetId ?? 0,
    rows: s.properties?.gridProperties?.rowCount ?? 0,
  }));
}

/** batchUpdate cấu trúc (thêm tab, đóng băng dòng, đặt định dạng cột…). */
export async function structureUpdate(requests: unknown[]) {
  if (!requests.length) return;
  await call(`:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
}

/**
 * Đảm bảo tab tồn tại và có đúng dòng tiêu đề. Nếu tab đã có nhưng thiếu tiêu đề
 * thì ghi tiêu đề vào dòng 1. KHÔNG đụng tới dữ liệu bên dưới.
 * Trả về sheetId nội bộ của tab.
 */
export async function ensureTab(title: string, header: string[]): Promise<number> {
  const tabs = await listTabs();
  let tab = tabs.find((t) => t.title === title);

  if (!tab) {
    await structureUpdate([{ addSheet: { properties: { title } } }]);
    tab = (await listTabs()).find((t) => t.title === title);
    if (!tab) throw new SheetsError(`Không tạo được tab "${title}".`, 500);
  }

  const firstRow = await getValues(a1(title, "1:1"));
  const existing = (firstRow[0] ?? []).map((c) => String(c ?? "").trim());
  // So sánh đúng số cột của mình — cột anh tự thêm ở phía sau giữ nguyên.
  if (JSON.stringify(existing.slice(0, header.length)) !== JSON.stringify(header)) {
    await batchUpdateValues([
      { range: a1(title, `A1:${colName(header.length)}1`), values: [header] },
    ]);
    // đóng băng dòng tiêu đề cho dễ nhìn
    await structureUpdate([
      {
        updateSheetProperties: {
          properties: { sheetId: tab.id, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      },
    ]);
  }
  return tab.id;
}

/** 1 → A, 27 → AA */
export function colName(n: number): string {
  let s = "";
  let i = n;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}
