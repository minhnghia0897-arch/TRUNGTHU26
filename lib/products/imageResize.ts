// ============================================================================
// Thu nhỏ ảnh NGAY TRONG TRÌNH DUYỆT trước khi gửi lên. CHỈ CHẠY Ở CLIENT.
//
// Vì sao phải có: Vercel chặn thân yêu cầu quá 4.5MB ở tầng hạ tầng, TRƯỚC KHI
// code của mình chạy. Ảnh chụp bằng điện thoại thường 3–12MB nên tải thẳng là
// dính ngay, và lỗi trả về là chuỗi chữ "Request Entity Too Large" chứ không
// phải JSON — chỗ gọi đem đi parse thì vỡ thành thông báo vô nghĩa.
//
// Chốt chặn 5MB trong productStore.ts đã có sẵn, kèm câu báo lỗi tử tế bằng
// tiếng Việt, nhưng nó NẰM CAO HƠN giới hạn hạ tầng nên chưa bao giờ chạy được
// cho đúng trường hợp nó được viết ra.
//
// Thu nhỏ ở đây giải quyết tận gốc: 12MB thành ~200–400KB, khách tải trang cũng
// nhanh hơn và đỡ tốn dung lượng lưu trữ.
// ============================================================================

/** Cạnh dài nhất sau khi thu nhỏ. Khung ảnh sản phẩm rộng nhất 468px trên máy
 *  điện thoại, nên 1600px đã dư cho cả màn hình retina lẫn lúc phóng to xem. */
const MAX_EDGE = 1600;
const QUALITY = 0.85;

/** WEBP giữ được nền trong suốt và nhẹ hơn JPEG; máy nào không mã hoá được thì
 *  lùi về JPEG. Cả hai đều nằm trong danh sách máy chủ chấp nhận. */
const PREFERRED = "image/webp";
const FALLBACK = "image/jpeg";

/** Ảnh nhỏ sẵn thì khỏi đụng vào — mã hoá lại chỉ làm giảm chất lượng. */
const SKIP_UNDER = 900 * 1024;

/** GIF động: vẽ lại lên canvas là mất hoạt hình, chỉ còn khung đầu. Để nguyên. */
const KEEP_AS_IS = new Set(["image/gif"]);

const toBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));

/**
 * Trả về file đã thu nhỏ, hoặc CHÍNH FILE GỐC nếu không cần/không thu được.
 *
 * Không bao giờ ném lỗi: máy không giải mã được định dạng (HEIC của iPhone là
 * hay gặp) thì cứ để file gốc đi tiếp — máy chủ có câu báo lỗi rõ ràng cho
 * định dạng lạ, tốt hơn là chặn ở đây bằng một lỗi khó hiểu.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (KEEP_AS_IS.has(file.type)) return file;
  if (file.size <= SKIP_UNDER) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    let blob = await toBlob(canvas, PREFERRED);
    let type = PREFERRED;
    // Trình duyệt không mã hoá được WEBP thì `toBlob` trả về PNG, nhận ra bằng
    // chính `blob.type`. Lúc đó ép sang JPEG cho chắc.
    if (!blob || blob.type !== PREFERRED) {
      blob = await toBlob(canvas, FALLBACK);
      type = FALLBACK;
    }
    if (!blob) return file;

    // Thu nhỏ mà lại to hơn bản gốc (ảnh gốc nén rất tốt) thì giữ bản gốc.
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "");
    const ext = type === PREFERRED ? "webp" : "jpg";
    return new File([blob], `${base}.${ext}`, { type });
  } catch {
    return file;
  }
}
