// ============================================================================
// Đẩy file lên Google Drive ngay từ trình duyệt (không cần server).
//
// Dùng Google Identity Services (GIS) lấy access token theo scope `drive.file`
// — scope hẹp nhất: app CHỈ nhìn thấy và sửa được những file do chính nó tạo,
// không đọc được Drive sẵn có của anh. Vì là scope không nhạy cảm nên không
// phải qua vòng thẩm định của Google.
//
// Cần env `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (OAuth Client ID kiểu Web application,
// khai báo Authorized JavaScript origins = tên miền của web).
// ============================================================================

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FOLDER_KEY = "tr_drive_folder";

/** Thư mục mặc định chứa file xuất ra. */
export const DEFAULT_FOLDER = "Doran King — Xuất dữ liệu";

export const driveClientId = () => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const isDriveConfigured = () => Boolean(driveClientId());

export interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
}

// ---------------------------------------------------------- GIS token client
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
}
type GoogleGlobal = {
  accounts?: {
    oauth2?: {
      initTokenClient: (c: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string }) => void;
      }) => TokenClient;
    };
  };
};

const gis = (): GoogleGlobal | undefined =>
  (window as unknown as { google?: GoogleGlobal }).google;

let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (gis()?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Không tải được Google Identity Services (kiểm tra mạng / chặn quảng cáo)."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// token giữ trong bộ nhớ (không lưu localStorage — hết phiên là mất, an toàn hơn)
let cachedToken = "";
let cachedUntil = 0;

/**
 * Lấy access token Drive. Lần đầu Google hiện cửa sổ xin quyền; các lần sau
 * trong cùng phiên dùng lại token đã cấp cho tới khi hết hạn.
 */
export async function getDriveToken(): Promise<string> {
  const clientId = driveClientId();
  if (!clientId)
    throw new Error(
      "Chưa cấu hình NEXT_PUBLIC_GOOGLE_CLIENT_ID — xem hướng dẫn ở docs/google-drive.md.",
    );
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;

  await loadGis();
  const oauth2 = gis()?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services chưa sẵn sàng.");

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (res) => {
        if (res.error || !res.access_token) {
          reject(new Error(res.error_description || res.error || "Không lấy được quyền Drive."));
          return;
        }
        cachedToken = res.access_token;
        // trừ hao 60s để không dùng token sát giờ hết hạn
        cachedUntil = Date.now() + Math.max(0, (res.expires_in ?? 3600) - 60) * 1000;
        resolve(cachedToken);
      },
      error_callback: (e) =>
        reject(
          new Error(
            e?.type === "popup_closed"
              ? "Anh đã đóng cửa sổ đăng nhập Google."
              : "Cửa sổ Google bị chặn — cho phép popup rồi thử lại.",
          ),
        ),
    });
    client.requestAccessToken();
  });
}

/** Quên token đang giữ (dùng khi muốn đổi tài khoản Google). */
export function forgetDriveToken() {
  cachedToken = "";
  cachedUntil = 0;
}

async function driveFetch(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = j.error?.message ?? "";
    } catch {
      /* body không phải JSON */
    }
    if (res.status === 401 || res.status === 403) forgetDriveToken();
    throw new Error(`Google Drive lỗi ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res;
}

/**
 * Tìm (hoặc tạo) thư mục chứa file xuất. Với scope `drive.file`, `files.list`
 * chỉ thấy file do app này tạo — nên tìm thấy nghĩa là đúng thư mục của mình.
 */
export async function ensureFolder(token: string, name = DEFAULT_FOLDER): Promise<string> {
  const remembered = (() => {
    try {
      return localStorage.getItem(FOLDER_KEY) ?? "";
    } catch {
      return "";
    }
  })();
  if (remembered) {
    try {
      await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${remembered}?fields=id,trashed`,
        token,
      );
      return remembered;
    } catch {
      /* thư mục đã bị xoá → tạo lại bên dưới */
    }
  }

  const q = encodeURIComponent(
    `mimeType='${FOLDER_MIME}' and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
  );
  const found = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
    token,
  );
  const list = (await found.json()) as { files?: { id: string }[] };
  let id = list.files?.[0]?.id;

  if (!id) {
    const made = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
    });
    id = ((await made.json()) as { id: string }).id;
  }

  try {
    localStorage.setItem(FOLDER_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

/** Upload một Blob lên Drive (multipart: metadata + nội dung trong một request). */
export async function uploadToDrive(
  token: string,
  file: { name: string; blob: Blob; folderId?: string },
): Promise<DriveFile> {
  const boundary = `doranking${Math.random().toString(36).slice(2)}`;
  const metadata = {
    name: file.name,
    mimeType: file.blob.type || "application/octet-stream",
    ...(file.folderId ? { parents: [file.folderId] } : {}),
  };

  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
      file.blob,
      `\r\n--${boundary}--\r\n`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );

  const res = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    token,
    { method: "POST", headers: { "content-type": body.type }, body },
  );
  return (await res.json()) as DriveFile;
}

/** Gộp cả luồng: xin quyền → đảm bảo thư mục → upload. */
export async function saveToDrive(name: string, blob: Blob, folder = DEFAULT_FOLDER) {
  const token = await getDriveToken();
  const folderId = await ensureFolder(token, folder);
  return uploadToDrive(token, { name, blob, folderId });
}
