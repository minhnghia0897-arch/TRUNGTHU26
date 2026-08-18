"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ORDERS,
  PIPELINE,
  RELEASED_STATUS,
  STATUS_COLOR,
  type OrderRow,
  type OrderSource,
  type Status,
} from "@/lib/ordersMock";
import {
  IconSearch,
  IconFacebook,
  IconGlobe,
  IconStore,
  IconChevronDown,
  IconTruck,
  IconDollar,
  IconXCircle,
  IconReturn,
  IconCopyDoc,
  IconTrash,
  IconPlus,
} from "@/components/icons";
import OrderDetailModal, { type HistoryEntry } from "@/components/OrderDetailModal";
import CreateOrderModal from "@/components/CreateOrderModal";
import ExportButton from "@/components/ExportButton";
import OrdersStateBanner from "@/components/OrdersStateBanner";
import { useOrders, stamp } from "@/components/useOrders";
import { ordersToSheets, exportFileName } from "@/lib/ordersExport";
import { displayCode, rowKrw } from "@/lib/orders/orderSchema";
import type { Box, Combo, Flavor } from "@/lib/types";

const FX = 18.5;
type Cur = "krw" | "vnd";
type SourceFilter = "all" | OrderSource;

/**
 * Tab thùng rác.
 *
 * Cố ý KHÔNG phải một giá trị của `Status`: đơn đã xoá vẫn giữ nguyên trạng thái
 * cũ trong database ("Huỷ đơn"), còn đây chỉ là cái tab đang mở. Nhập nó vào
 * `Status` là mở đường cho việc lỡ tay ghi chữ này xuống database thành trạng
 * thái thật của đơn.
 */
const DELETED = "__deleted__" as const;
type StatusFilter = Status | "all" | typeof DELETED;

const SOURCE_LABEL: Record<OrderSource, string> = {
  web: "Online",
  facebook: "Facebook",
  pos: "Tại quầy",
};

function SourceIcon({ s }: { s: OrderSource }) {
  if (s === "facebook") return <IconFacebook className="text-[#1877F2]" width={15} height={15} />;
  if (s === "web") return <IconGlobe className="text-emerald-500" width={15} height={15} />;
  return <IconStore className="text-slate-400" width={15} height={15} />;
}

const MENU: { label: Status | "Tạo trùng lặp"; Icon: typeof IconTruck; danger?: boolean }[] = [
  { label: "Đã thu tiền", Icon: IconDollar },
  { label: "Khách trả lại", Icon: IconReturn },
  { label: "Đã hoàn toàn bộ", Icon: IconReturn },
  { label: "Đã gửi hàng", Icon: IconTruck },
  { label: "Huỷ đơn", Icon: IconXCircle, danger: true },
  { label: "Tạo trùng lặp", Icon: IconCopyDoc },
];

export default function OrdersTable({
  boxes,
  flavors,
  combos,
  fbPageId,
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  fbPageId?: string;
}) {
  // Nguồn đơn dùng chung với trang Khách hàng / Thu chi. Đã nối cơ sở dữ liệu thì
  // mọi thao tác đi thẳng vào database; chưa nối thì chạy đơn mẫu để xem thử.
  const store = useOrders();
  const rows = store.rows;
  const history = store.history;

  const [source, setSource] = useState<SourceFilter>("all");
  const [warehouse, setWarehouse] = useState<"all" | "vn" | "kr">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [cur, setCur] = useState<Cur>("krw");
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pageSize, setPageSize] = useState(500);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Kho do MÁY CHỦ cộng trừ theo trạng thái (lib/orders/orderStore.ts). Bản cũ
  // làm ở đây và ghi vào localStorage — tức ghi vào chỗ không ai đọc, nên huỷ
  // đơn xong kho thật không bao giờ được hoàn.
  const saveOrder = (input: OrderRow, changes: string[]) => {
    void store.saveOrder(input, changes);
  };

  const money = (krw: number) =>
    cur === "vnd"
      ? Math.round(krw * FX).toLocaleString("vi-VN") + "đ"
      : "₩" + Math.round(krw).toLocaleString("en-US");

  // Đơn đã xoá KHÔNG được lẫn vào các tab thường: nó đã bị trừ khỏi doanh thu,
  // đã hoàn kho, và anh chủ coi như nó không tồn tại. Chỉ hiện khi bấm đúng tab
  // "Đã xoá".
  const baseRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (Boolean(r.voided) !== (status === DELETED)) return false;
      const okS = source === "all" || r.source === source;
      const okW = warehouse === "all" || r.region === warehouse;
      const okQ =
        !query ||
        [displayCode(r), r.vc, r.customer, r.recipient, r.phone, r.address, r.note, ...r.tags]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return okS && okW && okQ;
    });
  }, [rows, source, warehouse, q, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: baseRows.length };
    for (const s of PIPELINE) c[s] = 0;
    for (const r of baseRows) c[r.status] = (c[r.status] ?? 0) + 1;
    // Đếm thẳng trên `rows`: `baseRows` đã lọc bỏ đơn đã xoá nên đếm ở đó luôn
    // ra 0, và con số trên tab sẽ mãi là 0 dù thùng rác có đơn.
    c[DELETED] = rows.filter((r) => Boolean(r.voided)).length;
    return c;
  }, [baseRows, rows]);

  const list =
    status === "all" || status === DELETED ? baseRows : baseRows.filter((r) => r.status === status);

  // Xuất Excel: đang tick dòng nào thì xuất đúng những dòng đó, không thì xuất
  // trọn kết quả đang lọc (không chỉ trang hiện tại).
  const exportRows = selected.size ? rows.filter((r) => selected.has(r.id)) : list;
  const exportNote =
    [
      selected.size ? `Đang chọn ${selected.size} đơn` : null,
      source === "all" ? null : `Nguồn: ${SOURCE_LABEL[source]}`,
      warehouse === "all" ? null : `Kho: ${warehouse === "vn" ? "VN" : "Hàn"}`,
      status === "all" ? null : status === DELETED ? "Đơn đã xoá" : `Trạng thái: ${status}`,
      q.trim() ? `Tìm: "${q.trim()}"` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Tất cả đơn";

  // phân trang
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = list.slice((curPage - 1) * pageSize, curPage * pageSize);

  // chọn nhiều
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allChecked) pageRows.forEach((r) => n.delete(r.id));
      else pageRows.forEach((r) => n.add(r.id));
      return n;
    });
  const toggleOne = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  /**
   * Gắn một nhãn cho các đơn đang chọn.
   *
   * Nút này trước đây không có onClick — bấm không làm gì. Nhãn đã có sẵn thì
   * bỏ qua đơn đó để không nhân đôi.
   */
  const addTagToSelected = () => {
    const raw = window.prompt(`Gắn nhãn cho ${selected.size} đơn đang chọn:`);
    const tag = raw?.trim();
    if (!tag) return;
    rows
      .filter((r) => selected.has(r.id) && !r.tags.includes(tag))
      .forEach((r) => {
        void store.saveOrder({ ...r, tags: [...r.tags, tag] }, [`Thêm nhãn "${tag}"`]);
      });
    setSelected(new Set());
  };

  const deleteSelected = () => {
    // Xoá là thao tác khó lấy lại từ giao diện — hỏi lại, và nói rõ hệ quả.
    // Kho được máy chủ hoàn trước khi đánh dấu xoá.
    const n = selected.size;
    const ok = window.confirm(
      `Xoá ${n} đơn khỏi bảng?\n\n` +
        `Đơn sẽ chuyển sang "Huỷ đơn", bị loại khỏi doanh thu và hàng được hoàn về kho. ` +
        `Xem lại ở tab "Đơn đã xoá".`,
    );
    if (!ok) return;
    void store.removeOrders([...selected]);
    setSelected(new Set());
  };

  // Đơn huỷ / khách trả lại / đã hoàn toàn bộ KHÔNG tính tiền nữa.
  //
  // Trước đây dòng tổng ở đây cộng tất cả, trong khi Thu chi và Khách hàng đã
  // loại — nên huỷ một đơn xong ba trang báo ba con số khác nhau.
  const released = list.filter((r) => RELEASED_STATUS.has(r.status)).length;
  const totals = list
    .filter((r) => !RELEASED_STATUS.has(r.status))
    .reduce(
      (a, r) => ({
        // Tổng tiền bill = tiền khách phải trả cho đơn, bất kể đã trả hay chưa.
        // Phải cộng `prepaid + cod` chứ KHÔNG lấy riêng cột nào: hai cột đó chỉ
        // là cách chia một số tiền thành "đã thu" và "chưa thu", nên nhìn một
        // cột thôi là ra số khác nhau tuỳ đơn đã thu tiền hay chưa.
        bill: a.bill + rowKrw(r.prepaid, r) + rowKrw(r.cod, r),
        cod: a.cod + rowKrw(r.cod, r),
        prepaid: a.prepaid + rowKrw(r.prepaid, r),
        cuoc: a.cuoc + rowKrw(r.cuoc_vc, r),
        phi: a.phi + rowKrw(r.phi_vc_thu_khach, r),
      }),
      { bill: 0, cod: 0, prepaid: 0, cuoc: 0, phi: 0 },
    );

  const createOrder = async (payload: Omit<OrderRow, "id">) => {
    setShowCreate(false);
    const order = await store.addOrder({ ...payload, created: stamp() });
    if (order) setDetailId(order.id);
  };

  /**
   * Nhân bản một đơn thành đơn mới.
   *
   * Nút này trước đây chỉ đóng menu, không làm gì. Đơn mới bắt đầu lại từ
   * "Mới": bỏ mã vận chuyển và bỏ dấu đã-thu-tiền của đơn cũ, vì đó là dữ kiện
   * riêng của lần giao trước. Máy chủ sẽ trừ kho cho đơn mới như đơn thường.
   */
  const duplicateOrder = async (id: number) => {
    const row = rows.find((r) => r.id === id);
    setMenu(null);
    if (!row) return;
    const { id: _id, ...rest } = row;
    void _id;
    const order = await store.addOrder({
      ...rest,
      status: "Mới",
      vc: "",
      created: stamp(),
      stockApplied: false,
      note: row.note ? `${row.note} (bản sao)` : "Bản sao",
    });
    if (order) setDetailId(order.id);
  };

  const setStatusOf = (id: number, s: Status) => {
    const row = rows.find((r) => r.id === id);
    if (row) void store.saveOrder({ ...row, status: s }, [`Trạng thái → ${s}`]);
    setMenu(null);
  };

  const SOURCE_TABS: [SourceFilter, string][] = [
    ["all", "Tất cả"],
    ["web", "Online"],
    ["facebook", "Facebook"],
    ["pos", "Tại quầy"],
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-700" onClick={() => menu && setMenu(null)}>
      {/* topbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-[15px] font-semibold text-slate-800">Đơn hàng</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
        >
          <IconPlus width={15} height={15} /> Tạo đơn
        </button>
        <div className="relative ml-auto w-full max-w-md">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width={16} height={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mã đơn / Mã VC / Tên / Địa chỉ / SĐT / Ghi chú"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px]"
          />
        </div>
        <select
          value={warehouse}
          onChange={(e) => setWarehouse(e.target.value as typeof warehouse)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
        >
          <option value="all">Tất cả các kho</option>
          <option value="kr">🇰🇷 Kho Hàn</option>
          <option value="vn">🇻🇳 Kho VN</option>
        </select>
        <select
          value={cur}
          onChange={(e) => setCur(e.target.value as Cur)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
        >
          <option value="krw">₩ KRW</option>
          <option value="vnd">đ VND</option>
        </select>
        <ExportButton
          count={exportRows.length}
          build={() => ({
            sheets: ordersToSheets(exportRows, { cur, fx: FX, filterNote: exportNote }),
            fileName: exportFileName(),
          })}
        />
      </div>

      <OrdersStateBanner store={store} />

      {/* source tabs */}
      <div className="flex gap-6 border-b border-slate-200 bg-white px-5">
        {SOURCE_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSource(key)}
            className={`border-b-2 py-2.5 text-[13px] font-medium transition ${source === key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* status count tabs */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-5 py-2.5">
        <StatusTab label="Tất cả" count={counts.all} active={status === "all"} onClick={() => setStatus("all")} />
        {PIPELINE.map((s) => (
          <StatusTab key={s} label={s} count={counts[s] ?? 0} active={status === s} onClick={() => setStatus(s)} />
        ))}
        {/* Thùng rác đứng tách hẳn ra sau vạch: nó không phải một chặng trong
            quy trình như các tab kia, mà là chỗ đơn đã ra khỏi quy trình. */}
        <span className="mx-1 w-px flex-none self-stretch bg-slate-200" aria-hidden />
        <StatusTab
          label="Đơn đã xoá"
          count={counts[DELETED] ?? 0}
          active={status === DELETED}
          onClick={() => setStatus(DELETED)}
        />
      </div>

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-blue-100 bg-blue-50 px-5 py-2.5 text-[13px]">
          <span className="font-medium text-blue-700">Đã chọn {selected.size} đơn</span>
          {status !== DELETED && (
            <button
              onClick={deleteSelected}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-medium text-rose-600 hover:bg-rose-50"
            >
              <IconTrash width={15} height={15} /> Xoá
            </button>
          )}
          <button
            onClick={addTagToSelected}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
          >
            <IconPlus width={15} height={15} /> Thêm nhãn
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-slate-500 hover:underline"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <Th className="w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
                />
              </Th>
              <Th>ID</Th>
              <Th>VC</Th>
              <Th>Thẻ</Th>
              <Th>Sản phẩm</Th>
              <Th>Ghi chú</Th>
              <Th>Khách hàng</Th>
              <Th>Người nhận</Th>
              <Th>SĐT</Th>
              <Th>Nhận hàng</Th>
              <Th className="text-right">Tổng bill</Th>
              <Th className="text-right">Trả trước</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className={selected.has(r.id) ? "bg-blue-50/60" : "bg-white hover:bg-slate-50"}>
                <Td>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
                  />
                </Td>
                <Td className="whitespace-nowrap">
                  <button
                    onClick={() => setDetailId(r.id)}
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:underline"
                  >
                    <SourceIcon s={r.source} /> {displayCode(r)}
                  </button>
                </Td>
                <Td className="whitespace-nowrap text-slate-500">{r.vc || "—"}</Td>
                <Td>
                  {r.tags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">{t}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </Td>
                <Td className="max-w-[220px] truncate text-slate-700" title={r.product}>{r.product || <span className="text-slate-300">—</span>}</Td>
                <Td className="max-w-[120px] truncate text-slate-500" title={r.note}>{r.note || <span className="text-slate-300">—</span>}</Td>
                <Td className="whitespace-nowrap text-slate-700">{r.customer}</Td>
                <Td className="whitespace-nowrap text-slate-700">{r.recipient}</Td>
                <Td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-medium text-blue-600">{r.phone}</span>
                    {r.carrier && (
                      <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">{r.carrier}</span>
                    )}
                  </span>
                </Td>
                <Td className="max-w-[190px] truncate text-slate-600" title={r.address}>
                  <span className="mr-1">{r.region === "kr" ? "🇰🇷" : "🇻🇳"}</span>
                  {r.address}
                </Td>
                {/* Tổng tiền của CHÍNH đơn này = trả trước + COD. Hai cột đó chỉ là
                    cách chia một số tiền thành "đã thu" và "chưa thu", nên nhìn
                    riêng cột nào cũng ra số khác nhau tuỳ đơn đã thu hay chưa —
                    cùng cách tính với dòng tổng ở chân bảng. */}
                <Td className="whitespace-nowrap text-right font-semibold text-slate-900">
                  {money(rowKrw(r.prepaid, r) + rowKrw(r.cod, r))}
                </Td>
                <Td className="whitespace-nowrap text-right font-medium text-slate-700">
                  {money(rowKrw(r.prepaid, r))}
                </Td>
                <Td>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenu(menu?.id === r.id ? null : { id: r.id, x: rect.left, y: rect.bottom + 4 });
                    }}
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-semibold ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {r.status} <IconChevronDown width={13} height={13} />
                  </button>
                </Td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={11} className="bg-white px-4 py-10 text-center text-slate-400">
                  Không có đơn khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* footer */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-200 bg-white px-5 py-3 text-[13px]">
        <span className="font-semibold text-slate-800">{list.length} đơn</span>
        {released > 0 && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px] text-slate-500">
            không tính {released} đơn huỷ/trả/hoàn
          </span>
        )}
        <span className="text-slate-500">COD: <b className="text-slate-800">{money(totals.cod)}</b></span>
        {/* Đứng sát ngay trước "Trả trước" để đọc được một cặp: đơn tổng bao nhiêu
            tiền, và khách đã trả bao nhiêu trong đó. */}
        <span className="text-slate-500">
          Tổng bill: <b className="text-slate-900">{money(totals.bill)}</b>
        </span>
        <span className="text-slate-500">Trả trước: <b className="text-slate-800">{money(totals.prepaid)}</b></span>
        <span className="text-slate-500">Cước VC: <b className="text-slate-800">{money(totals.cuoc)}</b></span>
        <span className="text-slate-500">Phí VC: <b className="text-slate-800">{money(totals.phi)}</b></span>
        <div className="flex-1" />
        {/* pagination */}
        <div className="flex items-center gap-2 text-slate-500">
          <span>
            {list.length === 0 ? 0 : (curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, list.length)} / {list.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={curPage <= 1}
            className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            ‹
          </button>
          <span className="tabular-nums">{curPage}/{totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={curPage >= totalPages}
            className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            ›
          </button>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded border border-slate-200 bg-white px-2 py-1"
          >
            <option value={100}>100 / trang</option>
            <option value={300}>300 / trang</option>
            <option value={500}>500 / trang</option>
            <option value={1000}>1000 / trang</option>
          </select>
        </div>
      </div>

      {/* menu đổi trạng thái */}
      {menu && (
        <div
          className="fixed z-50 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 220), top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {MENU.map(({ label, Icon, danger }) => (
            <button
              key={label}
              onClick={() => {
                if (label === "Tạo trùng lặp") return duplicateOrder(menu.id);
                setStatusOf(menu.id, label as Status);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] hover:bg-slate-50 ${danger ? "text-rose-600" : "text-slate-700"}`}
            >
              <Icon width={16} height={16} className={danger ? "text-rose-400" : "text-slate-400"} />
              {label}
            </button>
          ))}
          <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
            Huỷ / trả / hoàn: loại khỏi doanh thu và hoàn hàng về kho.
          </div>
        </div>
      )}

      {/* form tạo đơn mới */}
      {showCreate && (
        <CreateOrderModal
          boxes={boxes}
          flavors={flavors}
          combos={combos}
          onCreate={createOrder}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* popup chi tiết đơn */}
      {detailId !== null && (() => {
        const order = rows.find((r) => r.id === detailId);
        return order ? (
          <OrderDetailModal
            order={order}
            history={history[detailId] ?? []}
            boxes={boxes}
            flavors={flavors}
            combos={combos}
            fbPageId={fbPageId}
            onSave={saveOrder}
            onClose={() => setDetailId(null)}
          />
        ) : null;
      })()}
    </main>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`border-b border-slate-200 px-3 py-2.5 ${className}`}>{children}</th>;
}
function Td({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`border-b border-slate-100 px-3 py-2.5 ${className}`} title={title}>
      {children}
    </td>
  );
}

function StatusTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${active ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
    >
      {label}
      <span className={`rounded px-1.5 text-[11px] ${active ? "bg-white/25" : "bg-slate-200 text-slate-500"}`}>{count}</span>
    </button>
  );
}
