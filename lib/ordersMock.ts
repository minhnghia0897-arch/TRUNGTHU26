import type { Region } from "./types";

// ============================================================================
// Dữ liệu đơn hàng kiểu Pancake (mock) cho trang quản lý đơn. Money = KRW/VND
// integer. Khi nối Pancake thật, thay bằng mirror từ webhook (§10.4/§15).
// ============================================================================

export type OrderSource = "facebook" | "web" | "pos";
export type Carrier = "Viettel" | "GHN" | "GHTK" | "CJ" | "Vinaphone" | "Vietnamobile" | "";

// Pipeline trạng thái Pancake (§10.5) + trạng thái kết/hoàn
export const PIPELINE = [
  "Mới",
  "Chờ hàng",
  "Đã xác nhận",
  "Đang đóng hàng",
  "Chờ chuyển hàng",
  "Đã gửi hàng",
  "Đã nhận",
  "Đã thu tiền",
] as const;
export type Status =
  | (typeof PIPELINE)[number]
  | "Khách trả lại"
  | "Đã hoàn toàn bộ"
  | "Huỷ đơn";

export interface OrderRow {
  id: number;
  source: OrderSource;
  vc: string;
  tags: string[];
  note: string;
  customer: string;
  recipient: string;
  phone: string;
  carrier: Carrier;
  address: string;
  region: Region; // kr → kho Hàn, vn → kho VN
  cod: number;
  prepaid: number;
  /**
   * Phí ship + phí xử lý KHÁCH TRẢ, nằm trong `prepaid`/`cod` chứ không cộng
   * thêm. Tách ra để màn hình chi tiết tính được tiền hàng thuần.
   */
  shipFee?: number;
  /** Tiền hàng của kiện theo giá niêm yết lúc đặt. Mốc để tính tổng phải thu. */
  goodsAmount?: number;
  cuoc_vc: number;
  phi_vc_thu_khach: number;
  status: Status;
  // tuỳ chọn — cho popup chi tiết
  created?: string;
  assignee?: string;
  product?: string;
  expected?: string;
  gender?: "Nữ" | "Nam";
  successOrders?: string; // "1/1 đơn"
  lastBuy?: string;
  // liên kết kho: SKU tiêu hao của đơn (vd { "vo-gam":1, "b-thapcam":1, ... })
  consume?: Record<string, number>;
  stockApplied?: boolean; // đơn này hiện đang trừ kho hay chưa
}

// màu pill theo trạng thái (giống Pancake)
export const STATUS_COLOR: Record<string, string> = {
  "Mới": "bg-slate-200 text-slate-700",
  "Chờ hàng": "bg-amber-100 text-amber-700",
  "Đã xác nhận": "bg-blue-600 text-white",
  "Đang đóng hàng": "bg-violet-600 text-white",
  "Chờ chuyển hàng": "bg-teal-600 text-white",
  "Đã gửi hàng": "bg-orange-500 text-white",
  "Đã nhận": "bg-green-500 text-white",
  "Đã thu tiền": "bg-green-800 text-white",
  "Khách trả lại": "bg-rose-100 text-rose-700",
  "Đã hoàn toàn bộ": "bg-rose-200 text-rose-800",
  "Huỷ đơn": "bg-red-600 text-white",
};

const KR = (a: string) => a;
export const ORDERS: OrderRow[] = [
  { id: 1204, source: "facebook", vc: "CJ-771204", tags: [], note: "", customer: "Ly", recipient: "Ly", phone: "01055861555", carrier: "CJ", address: KR("부산광역시 사상구 사…"), region: "kr", cod: 0, prepaid: 96000, cuoc_vc: 3000, phi_vc_thu_khach: 0, status: "Đã nhận" },
  { id: 1203, source: "facebook", vc: "CJ-771203", tags: ["Quà DN"], note: "Gói riêng", customer: "Hoàng Nga", recipient: "Hoàng Nga", phone: "01081432006", carrier: "CJ", address: KR("경주시 원화로392 …"), region: "kr", cod: 0, prepaid: 144000, cuoc_vc: 3000, phi_vc_thu_khach: 0, status: "Đang đóng hàng" },
  { id: 1202, source: "facebook", vc: "CJ-771202", tags: [], note: "", customer: "Nguyễn Thị Hoài", recipient: "Nguyễn Thị Hoài", phone: "01082422201", carrier: "CJ", address: KR("경기도 고양시 덕양구…"), region: "kr", cod: 0, prepaid: 48000, cuoc_vc: 3000, phi_vc_thu_khach: 0, status: "Đã nhận" },
  { id: 1201, source: "facebook", vc: "GHN-55201", tags: [], note: "", customer: "Lien Truong Thi", recipient: "Lien Truong Thi", phone: "0889905764", carrier: "Vinaphone", address: "Q. Cầu Giấy, Hà Nội", region: "vn", cod: 0, prepaid: 90000, cuoc_vc: 1600, phi_vc_thu_khach: 0, status: "Đã nhận" },
  { id: 1200, source: "facebook", vc: "GHTK-90200", tags: ["VIP"], note: "", customer: "Luong Thu Oanh", recipient: "Luong Thu Oanh", phone: "0332388966", carrier: "Viettel", address: "TP. Thủ Đức, HCM", region: "vn", cod: 200000, prepaid: 0, cuoc_vc: 1600, phi_vc_thu_khach: 1600, status: "Đã thu tiền" },
  { id: 1198, source: "web", vc: "CJ-771198", tags: [], note: "", customer: "Sen Đá", recipient: "Sen Đá", phone: "0976678442", carrier: "Viettel", address: "Q. Hai Bà Trưng, Hà Nội", region: "vn", cod: 0, prepaid: 130000, cuoc_vc: 1600, phi_vc_thu_khach: 0, status: "Đã gửi hàng" },
  { id: 1196, source: "web", vc: "", tags: [], note: "Hẹn giao 20/9", customer: "hồng linh", recipient: "hồng linh", phone: "0326678509", carrier: "Viettel", address: "201: Hà Nội", region: "vn", cod: 0, prepaid: 65000, cuoc_vc: 0, phi_vc_thu_khach: 0, status: "Đã xác nhận" },
  { id: 1195, source: "facebook", vc: "CJ-771195", tags: [], note: "", customer: "Bùi Ngọc Ngà", recipient: "Bùi Ngọc Ngà", phone: "01099112233", carrier: "CJ", address: KR("서울특별시 강남구…"), region: "kr", cod: 0, prepaid: 48000, cuoc_vc: 3000, phi_vc_thu_khach: 0, status: "Đã gửi hàng" },
  { id: 1194, source: "facebook", vc: "CJ-771194", tags: [], note: "", customer: "Phương Oanh Nguyễn", recipient: "Phương Oanh Nguyễn", phone: "01068945599", carrier: "CJ", address: KR("서울 중구 퇴계로18…"), region: "kr", cod: 0, prepaid: 192000, cuoc_vc: 3000, phi_vc_thu_khach: 0, status: "Đang đóng hàng" },
  { id: 1193, source: "web", vc: "GHTK-90193", tags: [], note: "", customer: "Nguyễn Thanh Trà", recipient: "Nguyễn Thanh Trà", phone: "0398686364", carrier: "Viettel", address: "TP. Đà Nẵng", region: "vn", cod: 0, prepaid: 58000, cuoc_vc: 1600, phi_vc_thu_khach: 0, status: "Đã gửi hàng" },
  { id: 1192, source: "facebook", vc: "CJ-771192", tags: [], note: "", customer: "Trần Mai Lê", recipient: "Trần Mai Lê", phone: "0977200490", carrier: "Viettel", address: "Q. Long Biên, Hà Nội", region: "vn", cod: 0, prepaid: 120000, cuoc_vc: 1600, phi_vc_thu_khach: 0, status: "Đã nhận" },
  { id: 1191, source: "facebook", vc: "GHN-55191", tags: ["Ưu tiên"], note: "Gọi trước", customer: "Út Bưởi", recipient: "Út Bưởi", phone: "0921808678", carrier: "Vietnamobile", address: "Q. 7, HCM", region: "vn", cod: 0, prepaid: 78000, cuoc_vc: 1600, phi_vc_thu_khach: 0, status: "Đã nhận" },
  { id: 1189, source: "pos", vc: "", tags: ["Tại quầy"], note: "", customer: "Khách lẻ", recipient: "Khách lẻ", phone: "0900000000", carrier: "", address: "Nhận tại cửa hàng", region: "vn", cod: 0, prepaid: 65000, cuoc_vc: 0, phi_vc_thu_khach: 0, status: "Đã thu tiền" },
  { id: 1188, source: "web", vc: "CJ-771188", tags: [], note: "", customer: "Kim Min-ji", recipient: "Kim Min", phone: "01022334455", carrier: "CJ", address: KR("서울특별시 마포구…"), region: "kr", cod: 0, prepaid: 96000, cuoc_vc: 3000, phi_vc_thu_khach: 0, status: "Chờ chuyển hàng" },
  { id: 1187, source: "facebook", vc: "", tags: [], note: "", customer: "Park Ji-woo", recipient: "Văn phòng Busan", phone: "01098765432", carrier: "", address: KR("부산광역시 해운대구…"), region: "kr", cod: 0, prepaid: 142000, cuoc_vc: 0, phi_vc_thu_khach: 0, status: "Chờ hàng" },
  { id: 1186, source: "web", vc: "", tags: [], note: "", customer: "Lê Quốc Anh", recipient: "Nhà · Incheon", phone: "01055556666", carrier: "", address: KR("인천광역시 연수구…"), region: "kr", cod: 0, prepaid: 64000, cuoc_vc: 0, phi_vc_thu_khach: 0, status: "Mới" },
  { id: 1185, source: "facebook", vc: "GHTK-90185", tags: [], note: "", customer: "Đỗ Thảo", recipient: "Đỗ Thảo", phone: "0344556677", carrier: "Viettel", address: "TP. Huế", region: "vn", cod: 0, prepaid: 58000, cuoc_vc: 1600, phi_vc_thu_khach: 0, status: "Đã nhận" },
  { id: 1184, source: "facebook", vc: "CJ-771184", tags: [], note: "", customer: "Choi Soo", recipient: "Choi Soo", phone: "01033224455", carrier: "CJ", address: KR("대구광역시 수성구…"), region: "kr", cod: 0, prepaid: 39000, cuoc_vc: 3000, phi_vc_thu_khach: 0, status: "Khách trả lại" },
];
