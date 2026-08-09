"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Box, Combo, Flavor, Region, Warehouse } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import {
  boxPrice,
  flavorSurcharge,
  flavorRetailPrice,
  validateBoxFill,
  computeBill,
  type CartLine,
} from "@/lib/pricing";
import { applyStock } from "@/lib/stockStore";
import { cartConsume } from "@/lib/webInventory";
import { saveWebOrder } from "@/lib/webOrders";
import { addDashboardOrder } from "@/lib/dashboardOrders";
import { findLink, markUsed } from "@/lib/attribution";
import { normalizePhone } from "@/lib/phone";
import { IconTrash, IconPlus, IconMoon, IconLotus, IconStar, IconCheck, IconCopyDoc } from "@/components/icons";

const CART_KEY = "tr_cart";

type Recipient = {
  uid: string;
  name: string;
  phone: string;
  address: string;
  region: Region;
  desiredDate: string;
};

export type InitialSelection = { box?: string; combo?: string; la?: string; region?: string; ref?: string; express?: boolean };

let _id = 0;
const nid = () => "u" + ++_id;

// Trung Thu (15/8 âm lịch) theo dương lịch — tra cứu sẵn vài năm (demo).
const MID_AUTUMN: Record<number, string> = {
  2024: "2024-09-17", 2025: "2025-10-06", 2026: "2026-09-25",
  2027: "2027-09-15", 2028: "2028-10-03", 2029: "2029-09-22", 2030: "2030-09-12",
};
const pad2 = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Trước Trung Thu 1 tuần: lấy Trung Thu năm nay (nếu đã qua thì năm sau) − 7 ngày.
function midAutumnMinusWeek(): string {
  const now = new Date();
  const y = now.getFullYear();
  let iso = MID_AUTUMN[y];
  if (iso && new Date(iso + "T00:00:00").getTime() < now.getTime()) iso = MID_AUTUMN[y + 1];
  else iso = MID_AUTUMN[y] ?? MID_AUTUMN[y + 1];
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - 7);
  return isoLocal(d);
}

// Tài khoản nhận tiền (demo — thay bằng TK thật của anh sau).
const BANKS = {
  vn: { title: "🇻🇳 Việt Nam", bank: "Vietcombank", bin: "970436", number: "1023 456 789", holder: "CONG TY TRANG RAM" },
  kr: { title: "🇰🇷 Hàn Quốc", bank: "KB Kookmin", number: "123456-78-901234", holder: "TRANG RAM" },
};
const vietqrUrl = (amountVnd?: number) => {
  const num = BANKS.vn.number.replace(/\s/g, "");
  const q = amountVnd ? `?amount=${amountVnd}&addInfo=${encodeURIComponent("Trang Ram")}` : "";
  return `https://img.vietqr.io/image/${BANKS.vn.bin}-${num}-compact2.png${q}`;
};

export default function OrderFlow({
  boxes,
  flavors,
  combos,
  warehouses,
  fx,
  initial,
}: {
  boxes: Box[];
  flavors: Flavor[];
  combos: Combo[];
  warehouses: Warehouse[];
  fx: number;
  initial?: InitialSelection;
}) {
  const [step, setStep] = useState<number>(1);
  const [express, setExpress] = useState<boolean>(!!initial?.express); // đặt nhanh 1 trang (như TikTok)
  const [zaloHint, setZaloHint] = useState(false);
  const [buyerRegion, setBuyerRegion] = useState<Region>(initial?.region === "vn" ? "vn" : "kr");
  const [ref, setRef] = useState<string>(initial?.ref ?? ""); // token định danh từ Messenger
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string>(boxes[0]?.id);
  const [picks, setPicks] = useState<string[]>([]);
  const [openSlot, setOpenSlot] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | {
    code: string;
    transferCode: string;
    grandTotal: number;
    simulated?: boolean;
  }>(null);

  const box = boxes.find((b) => b.id === selectedBoxId) ?? boxes[0];
  const fmt = (v: number) => formatMoney(v, buyerRegion);

  // ảnh sản phẩm lấy từ Dashboard (localStorage tr_product_edits) — key box:<id> / flavor:<id>
  const [imgs, setImgs] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tr_product_edits");
      if (!raw) return;
      const ov = JSON.parse(raw) as Record<string, { images?: string[]; image?: string }>;
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(ov)) {
        const first = v?.images?.[0] ?? v?.image;
        if (first) m[k] = first;
      }
      setImgs(m);
    } catch {
      /* ignore */
    }
  }, []);
  const boxImg = (id: string) => imgs[`box:${id}`];
  const flavorImg = (id: string) => imgs[`flavor:${id}`];

  // ngày gợi ý "trước Trung Thu 1 tuần" — tính ở client để không lệch SSR
  const [suggestedDate, setSuggestedDate] = useState("");
  useEffect(() => setSuggestedDate(midAutumnMinusWeek()), []);
  const suggestedDDMM = suggestedDate ? `${suggestedDate.slice(8, 10)}/${suggestedDate.slice(5, 7)}` : "";

  // tên vị trong 1 món (để hiện rõ khi gán quà)
  const flavorNames = (ids?: string[]) =>
    (ids ?? []).map((id) => flavors.find((f) => f.id === id)?.name).filter(Boolean).join(" · ");

  // khách Messenger đã map từ token ?ref (nếu có)
  const refLink = ref ? findLink(ref) : undefined;

  const addCombo = (comboId: string) => {
    const c = combos.find((x) => x.id === comboId);
    if (!c) return;
    const b = boxes.find((x) => x.id === c.box_id) ?? boxes[0];
    const unit = boxPrice(b, c.flavor_ids, flavors, buyerRegion);
    setCart((cart) => [
      ...cart,
      { uid: nid(), kind: "combo", boxId: b.id, comboId: c.id, flavorIds: c.flavor_ids, qty: 1, unitPrice: unit, name: c.name, recipientUids: [] },
    ]);
  };
  const addFlavor = (flavorId: string) => {
    const f = flavors.find((x) => x.id === flavorId);
    if (!f) return;
    const unit = flavorRetailPrice(f, buyerRegion);
    setCart((cart) => {
      const existing = cart.find((l) => l.kind === "la" && l.flavorIds?.[0] === f.id);
      if (existing)
        return cart.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...cart,
        { uid: nid(), kind: "la", flavorIds: [f.id], qty: 1, unitPrice: unit, name: f.name + " (lẻ)", recipientUids: [] },
      ];
    });
  };
  const setQty = (uid: string, delta: number) =>
    setCart((cart) =>
      cart.flatMap((l) =>
        l.uid === uid ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l],
      ),
    );

  const hydrated = useRef(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const remember = useRef<{ name?: string; phone?: string; address?: string; region?: Region }>({});
  const prefilled = useRef(false);

  // tải ảnh hoá đơn (PNG)
  async function downloadBill() {
    const el = receiptRef.current;
    if (!el) return;
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bill-${done?.code ?? "trang-ram"}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch {
      alert("Không tạo được ảnh bill — anh chụp màn hình giúp nhé.");
    }
  }

  // preselect từ URL (?box / ?combo / ?la) — hoặc khôi phục giỏ đã lưu (F5 không mất)
  useEffect(() => {
    const fromUrl = !!(initial?.box || initial?.combo || initial?.la);
    if (fromUrl) {
      if (initial!.combo) addCombo(initial!.combo);
      if (initial!.la) addFlavor(initial!.la);
      if (initial!.box) {
        setSelectedBoxId(initial!.box);
        setPicks([]);
        setOpenSlot(0);
        setStep(1.5);
      } else if (initial!.express) {
        setStep(2); // combo/lẻ + express → vào thẳng checkout 1 trang
      }
    } else {
      try {
        const raw = localStorage.getItem(CART_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (Array.isArray(s.cart)) setCart(s.cart);
          if (s.buyerRegion) setBuyerRegion(s.buyerRegion);
          if (typeof s.buyerName === "string") setBuyerName(s.buyerName);
          if (typeof s.buyerPhone === "string") setBuyerPhone(s.buyerPhone);
          if (Array.isArray(s.recipients)) setRecipients(s.recipients);
          if (!initial?.ref && typeof s.ref === "string") setRef(s.ref); // giữ token qua F5
          const maxU = [...(s.cart ?? []), ...(s.recipients ?? [])].reduce(
            (m: number, x: { uid?: string }) => Math.max(m, parseInt(String(x.uid ?? "").replace(/\D/g, "")) || 0),
            0,
          );
          _id = Math.max(_id, maxU); // tránh trùng uid khi thêm món mới
        }
      } catch {
        /* ignore */
      }
    }
    // nhớ thông tin người mua từ lần trước (sống qua cả khi đặt xong)
    try {
      const rb = JSON.parse(localStorage.getItem("tr_buyer") || "null");
      if (rb && typeof rb === "object") {
        remember.current = rb;
        if (rb.region === "vn" || rb.region === "kr") setBuyerRegion(rb.region);
        if (typeof rb.name === "string" && rb.name) setBuyerName((v) => v || rb.name);
        if (typeof rb.phone === "string" && rb.phone) setBuyerPhone((v) => v || rb.phone);
      }
    } catch {
      /* ignore */
    }
    // dọn URL sau khi đã bắt deep-link / token → F5 khôi phục từ localStorage, không lặp
    if (fromUrl || initial?.ref) {
      try { window.history.replaceState({}, "", "/dat-hang"); } catch { /* ignore */ }
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lưu giỏ để F5 không mất
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ cart, buyerRegion, buyerName, buyerPhone, recipients, ref }));
    } catch {
      /* ignore */
    }
  }, [cart, buyerRegion, buyerName, buyerPhone, recipients, ref]);

  // EXPRESS: luôn có đúng 1 người nhận & gán mọi món cho người đó (checkout 1 trang)
  useEffect(() => {
    if (!express) return;
    if (recipients.length === 0) {
      const r = remember.current;
      setRecipients([
        {
          uid: nid(),
          name: r.name ?? "",
          phone: r.phone ?? "",
          address: r.address ?? "",
          region: (r.region as Region) ?? buyerRegion,
          desiredDate: "",
        },
      ]);
      prefilled.current = true;
      return;
    }
    const r0 = recipients[0].uid;
    setCart((c) => {
      let changed = false;
      const next = c.map((it) =>
        it.recipientUids.length === 1 && it.recipientUids[0] === r0
          ? it
          : ((changed = true), { ...it, recipientUids: [r0] }),
      );
      return changed ? next : c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [express, cart, recipients]);

  // express: form giao hàng ghi đồng thời vào người đặt + người nhận[0] (1 địa chỉ, ít gõ)
  const r0 = recipients[0];
  const exName = r0?.name ?? buyerName;
  const exPhone = r0?.phone ?? buyerPhone;
  const exAddress = r0?.address ?? "";
  const exDate = r0?.desiredDate ?? "";
  const setExName = (v: string) => { setBuyerName(v); if (r0) setR(r0.uid, "name", v); };
  const setExPhone = (v: string) => { setBuyerPhone(v); if (r0) setR(r0.uid, "phone", v); };
  const setExRegion = (v: Region) => { setBuyerRegion(v); if (r0) setR(r0.uid, "region", v); };

  const bill = useMemo(
    () =>
      computeBill(
        cart,
        recipients.map((r) => ({ uid: r.uid, region: r.region })),
        buyerRegion,
        warehouses,
        fx,
      ),
    [cart, recipients, buyerRegion, warehouses, fx],
  );

  // ---- builder ----
  const builderTotal =
    boxPrice(box, picks.filter(Boolean), flavors, buyerRegion);
  function pick(fid: string) {
    const next = [...picks];
    next[openSlot] = fid;
    setPicks(next);
    if (openSlot < box.slots - 1) setOpenSlot(openSlot + 1);
  }
  function addBox() {
    const v = validateBoxFill(box, picks.filter(Boolean), flavors);
    if (!v.ok) {
      alert(v.error);
      return;
    }
    const unit = boxPrice(box, picks, flavors, buyerRegion);
    setCart([
      ...cart,
      {
        uid: nid(),
        kind: "box",
        boxId: box.id,
        flavorIds: [...picks],
        qty: 1,
        unitPrice: unit,
        name: box.name,
        recipientUids: [],
      },
    ]);
    setPicks([]);
    setOpenSlot(0);
    setStep(express ? 2 : 1); // express: thêm hộp xong vào thẳng checkout
  }

  // ---- recipients ----
  function addRecipient() {
    setRecipients((r) => [
      ...r,
      { uid: nid(), name: "", phone: "", address: "", region: "kr", desiredDate: "" },
    ]);
  }
  function setR(uid: string, k: keyof Recipient, val: string) {
    setRecipients((rs) => rs.map((r) => (r.uid === uid ? { ...r, [k]: val } : r)));
  }
  function removeRecipient(uid: string) {
    setRecipients((rs) => rs.filter((r) => r.uid !== uid));
    // bỏ gán quà cho người vừa xoá
    setCart((c) => c.map((it) => ({ ...it, recipientUids: it.recipientUids.filter((x) => x !== uid) })));
  }
  function assign(itemUid: string, rUid: string) {
    setCart((c) =>
      c.map((it) =>
        it.uid === itemUid
          ? { ...it, recipientUids: it.recipientUids.includes(rUid) ? it.recipientUids.filter((x) => x !== rUid) : [...it.recipientUids, rUid] }
          : it,
      ),
    );
  }

  // mỗi món gán N người nhận → tách thành N dòng (mỗi người 1 phần) — tiền & kho tự nhân
  const expandedLines = cart.flatMap((l) =>
    l.recipientUids.map((ruid) => ({
      kind: l.kind,
      boxId: l.boxId,
      comboId: l.comboId,
      flavorIds: l.flavorIds,
      qty: l.qty,
      recipientUid: ruid,
    })),
  );

  // ---- submit ----
  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buyer: { name: buyerName, phone: buyerPhone, region: buyerRegion, refToken: ref || undefined },
          recipients: recipients.map((r) => ({
            uid: r.uid,
            name: r.name,
            phone: r.phone,
            address: r.address,
            region: r.region,
            desiredDate: r.desiredDate,
          })),
          lines: expandedLines,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error ?? "Tạo đơn thất bại.");
        return;
      }
      // trừ kho theo BOM (demo, dùng chung kho với dashboard) — theo dòng đã tách người nhận
      applyStock(cartConsume(expandedLines), -1);
      // định danh từ token Messenger (§10.1): map token → khách, đánh dấu đã dùng
      const link = ref ? findLink(ref) : undefined;
      if (ref && link) markUsed(ref, data.order.code);
      // đưa đơn web vào Dashboard → Đơn hàng (đã trừ kho ở web nên stockApplied=true)
      const r0 = recipients[0];
      const st = new Date();
      const p2 = (x: number) => String(x).padStart(2, "0");
      try {
        addDashboardOrder({
          source: ref ? "facebook" : "web",
          vc: "",
          tags: ref ? ["Messenger"] : ["Web"],
          note: `Web ${data.order.code} · CK ${data.order.transferCode}${link ? ` · Messenger: ${link.customerName}` : ""}`,
          customer: buyerName.trim(),
          recipient: r0?.name || buyerName.trim(),
          phone: buyerPhone.trim(),
          carrier: "",
          address: r0?.address || "",
          region: buyerRegion,
          cod: 0,
          prepaid: data.order.grandTotal,
          cuoc_vc: 0,
          phi_vc_thu_khach: 0,
          status: "Mới",
          created: `${p2(st.getDate())}/${p2(st.getMonth() + 1)}/${st.getFullYear()} ${p2(st.getHours())}:${p2(st.getMinutes())}`,
          assignee: "Web",
          product: cart.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(", "),
          expected: r0?.desiredDate || undefined,
          consume: cartConsume(expandedLines),
          stockApplied: true,
        });
      } catch {
        /* ignore */
      }
      // lưu đơn để trang Tra cứu tìm theo SĐT
      saveWebOrder({
        code: data.order.code,
        transferCode: data.order.transferCode,
        phone: normalizePhone(buyerPhone, buyerRegion) ?? buyerPhone.trim(),
        buyerName: buyerName.trim(),
        region: buyerRegion,
        currency: buyerRegion === "vn" ? "VND" : "KRW",
        grandTotal: data.order.grandTotal,
        items: cart.map((l) => `${l.name} ×${l.qty}`),
        status: "Chờ thanh toán",
        createdAt: Date.now(),
        ref: ref || undefined,
        refCustomer: link?.customerName,
      });
      try { localStorage.removeItem(CART_KEY); } catch { /* ignore */ }
      // nhớ thông tin cho lần đặt sau (sống qua khi xoá giỏ)
      try {
        localStorage.setItem("tr_buyer", JSON.stringify({
          name: buyerName.trim(),
          phone: buyerPhone.trim(),
          address: recipients[0]?.address ?? "",
          region: buyerRegion,
        }));
      } catch { /* ignore */ }
      setDone({
        code: data.order.code,
        transferCode: data.order.transferCode,
        grandTotal: data.order.grandTotal,
        simulated: data.order.simulated,
      });
      setStep(6);
    } finally {
      setSubmitting(false);
    }
  }

  // express: xác nhận đặt (1 trang)
  function expressSubmit() {
    if (!cart.length) return alert("Chưa có món nào.");
    if (!buyerName.trim()) return alert("Nhập tên người nhận.");
    if (!buyerPhone.trim()) return alert("SĐT là bắt buộc.");
    if (!recipients[0]?.address?.trim()) return alert("Nhập địa chỉ nhận hàng.");
    submit();
  }

  // đặt qua Zalo 1 chạm: soạn sẵn nội dung, copy rồi mở Zalo
  function orderViaZalo() {
    const lines = cart
      .map((l) => {
        const fl = l.kind !== "la" && flavorNames(l.flavorIds) ? ` (${flavorNames(l.flavorIds)})` : "";
        return `• ${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}${fl} — ${fmt(l.unitPrice * l.qty)}`;
      })
      .join("\n");
    const msg =
      `ĐẶT BÁNH — TRĂNG RẰM\n${lines}\n` +
      `Tạm tính: ${fmt(bill.subtotal)}\n` +
      (buyerName ? `Tên: ${buyerName}\n` : "") +
      (buyerPhone ? `SĐT: ${buyerPhone}\n` : "") +
      (exAddress ? `Địa chỉ: ${exAddress}\n` : "");
    try {
      navigator.clipboard.writeText(msg);
      setZaloHint(true);
      setTimeout(() => setZaloHint(false), 4000);
    } catch { /* ignore */ }
    try { window.open("https://zalo.me/0982576263", "_blank"); } catch { /* ignore */ }
  }

  // ---- nav guards ----
  function next() {
    if (step === 1) {
      if (!cart.length) return alert("Giỏ đang trống.");
      return setStep(2);
    }
    if (step === 2) {
      if (!buyerName.trim()) return alert("Nhập tên người đặt.");
      if (!buyerPhone.trim()) return alert("SĐT người đặt là bắt buộc.");
      if (!recipients.length) addRecipient();
      return setStep(3);
    }
    if (step === 3) {
      if (cart.some((it) => it.recipientUids.length === 0))
        return alert("Còn món chưa gán người nhận.");
      if (recipients.some((r) => !r.name.trim() || !r.address.trim()))
        return alert("Người nhận thiếu tên hoặc địa chỉ.");
      return setStep(4);
    }
    if (step === 4) return submit(); // đặt xong → trang thanh toán riêng
  }

  const STEPS = ["Giỏ", "Người đặt", "Người nhận", "Xem lại"];

  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream pb-28 shadow-2xl">
      <header className="relative flex items-center bg-maroon-deep px-4 py-3.5">
        <a href="/le" aria-label="Về trang chủ" className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-cream/70 hover:text-gold">
          <span className="text-base leading-none">←</span> Trang chủ
        </a>
        <a href="/le" className="title-heritage absolute left-1/2 -translate-x-1/2 text-base tracking-[0.18em] !text-[#E8C877] hover:!text-gold">Trăng Rằm</a>
      </header>

      {/* stepper */}
      <div className="flex bg-maroon text-cream">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const active = Math.floor(step) === n;
          const doneStep = n < Math.floor(step);
          return (
            <div
              key={s}
              className={`flex-1 py-2 text-center text-[9px] uppercase tracking-wide ${active ? "text-gold opacity-100" : "opacity-50"}`}
            >
              <div
                className={`mx-auto mb-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border font-serif text-[10px] ${doneStep ? "border-gold bg-gold text-maroon-deep" : "border-current"}`}
              >
                {doneStep ? "✓" : n}
              </div>
              {s}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-5">
        {/* STEP 1 — GIỎ */}
        {step === 1 && (
          <section className="step-in">
            <div className="eyebrow">Bước 1</div>
            <h2 className="title-heritage mb-4 text-lg">Giỏ hàng</h2>
            {cart.length === 0 ? (
              <div className="rounded border border-line bg-white p-4 text-center opacity-60">
                Giỏ trống — thêm hộp tự chọn bên dưới.
              </div>
            ) : (
              cart.map((it) => (
                <div key={it.uid} className="mb-3 rounded border border-line bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">
                        {it.name}
                      </div>
                      <div className="mt-1 text-xs opacity-70">
                        {(it.flavorIds ?? [])
                          .map((id) => flavors.find((f) => f.id === id)?.name)
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                    <button
                      onClick={() => setCart((c) => c.filter((x) => x.uid !== it.uid))}
                      aria-label="Xoá món"
                      className="grid h-8 w-8 flex-none place-items-center rounded-full border border-line text-maroon/50 hover:border-maroon hover:bg-maroon hover:text-cream"
                    >
                      <IconTrash width={15} height={15} />
                    </button>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    {/* số lượng — cho mọi loại (hộp / combo / lẻ) */}
                    <div className="inline-flex items-center overflow-hidden rounded-full border border-line">
                      <button
                        onClick={() => setQty(it.uid, -1)}
                        aria-label="Giảm số lượng"
                        className="grid h-8 w-8 place-items-center text-maroon hover:bg-cream"
                      >
                        <span className="block h-[2px] w-3 bg-current" />
                      </button>
                      <span className="w-8 text-center font-serif text-sm tabular-nums">{it.qty}</span>
                      <button
                        onClick={() => setQty(it.uid, 1)}
                        aria-label="Tăng số lượng"
                        className="grid h-8 w-8 place-items-center text-maroon hover:bg-cream"
                      >
                        <IconPlus width={14} height={14} />
                      </button>
                    </div>
                    <span className="font-serif text-[15px] font-semibold text-maroon-deep">
                      {fmt(it.unitPrice * it.qty)}
                    </span>
                  </div>
                </div>
              ))
            )}

            {/* Thêm sản phẩm */}
            <div className="mt-4 rounded border border-line bg-white p-3.5">
              <div className="eyebrow mb-2">Thêm sản phẩm</div>

              {/* hộp tự chọn */}
              <div className="mb-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-maroon">Hộp tự chọn</div>
                <div className="flex flex-wrap gap-1.5">
                  {boxes.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => { setSelectedBoxId(b.id); setPicks([]); setOpenSlot(0); setStep(1.5); }}
                      className="rounded border border-dashed border-line bg-cream px-3 py-2 text-[11px] text-maroon"
                    >
                      + {b.name} · {fmt(buyerRegion === "vn" ? b.price_vn : b.price_kr)}
                    </button>
                  ))}
                </div>
              </div>

              {/* combo */}
              {combos.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-maroon">Combo / Set</div>
                  <div className="flex flex-wrap gap-1.5">
                    {combos.map((c) => {
                      const b = boxes.find((x) => x.id === c.box_id) ?? boxes[0];
                      return (
                        <button
                          key={c.id}
                          onClick={() => addCombo(c.id)}
                          className="rounded border border-gold bg-cream px-3 py-2 text-[11px] text-maroon"
                        >
                          + {c.name} · {fmt(boxPrice(b, c.flavor_ids, flavors, buyerRegion))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* mua lẻ */}
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-maroon">Mua lẻ từng vị</div>
                <div className="flex flex-wrap gap-1.5">
                  {flavors.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => addFlavor(f.id)}
                      className={`rounded-full border px-2.5 py-1.5 text-[11px] ${f.premium ? "border-gold text-maroon" : "border-line"} bg-white`}
                    >
                      + {f.name} · {fmt(flavorRetailPrice(f, buyerRegion))}
                    </button>
                  ))}
                </div>
              </div>

              <a href="/san-pham" className="mt-3 block text-center text-[11px] text-gold underline">
                Xem chi tiết sản phẩm →
              </a>
            </div>
          </section>
        )}

        {/* STEP 1.5 — BUILDER */}
        {step === 1.5 && (
          <section className="step-in">
            <div className="eyebrow">Hộp tự chọn</div>
            <h2 className="title-heritage mb-4 text-lg">Lấp từng ô</h2>
            <div className="rounded border border-line bg-white p-3.5">
              {/* ảnh set quà */}
              <div className="mb-3 overflow-hidden rounded border border-line">
                {boxImg(box.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={boxImg(box.id)} alt={box.name} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-28 items-center justify-center bg-cream-soft text-gold/40"><IconLotus width={40} height={40} /></div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                {boxes.length > 1 ? (
                  <select
                    value={selectedBoxId}
                    onChange={(e) => { setSelectedBoxId(e.target.value); setPicks([]); setOpenSlot(0); }}
                    className="rounded border border-line bg-white px-2 py-1.5 font-serif text-[13px] uppercase tracking-wide text-maroon"
                  >
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} · {b.slots} ô</option>
                    ))}
                  </select>
                ) : (
                  <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">{box.name}</div>
                )}
                <span className="font-serif font-semibold text-maroon-deep">{fmt(builderTotal)}</span>
              </div>
              {box.description && (
                <p className="mt-1 text-[11px] opacity-65">{box.description}</p>
              )}
              <div className="my-3 grid grid-cols-3 gap-2">
                {Array.from({ length: box.slots }).map((_, i) => {
                  const f = picks[i] && flavors.find((x) => x.id === picks[i]);
                  const fi = picks[i] ? flavorImg(picks[i]) : undefined;
                  return (
                    <button
                      key={i}
                      onClick={() => setOpenSlot(i)}
                      className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded border p-1 text-center text-[11px] ${f ? "border-gold bg-white" : "border-dashed border-line bg-cream"} ${openSlot === i ? "ring-1 ring-gold" : ""}`}
                    >
                      {f && fi ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fi} alt={f.name} className="absolute inset-0 h-full w-full object-cover" />
                          <span className="absolute inset-x-0 bottom-0 bg-maroon-deep/70 px-1 py-0.5 text-[10px] leading-tight text-cream">{f.name}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gold">{f ? <IconStar width={18} height={18} /> : <IconPlus width={18} height={18} />}</span>
                          {f ? f.name : `Ô ${i + 1}`}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="eyebrow">Chọn vị cho ô đang mở</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {flavors.map((f) => {
                  const fi = flavorImg(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => pick(f.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] ${f.premium ? "border-gold text-maroon" : "border-line"} bg-white`}
                    >
                      {fi ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fi} alt="" className="h-5 w-5 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-cream-soft text-gold"><IconStar width={11} height={11} /></span>
                      )}
                      {f.name}
                      {f.premium && (
                        <span className="text-[10px] text-gold">+{fmt(flavorSurcharge(f, buyerRegion))}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={addBox}
              className="mt-3 w-full rounded bg-gold py-3 font-serif text-xs font-semibold uppercase tracking-widest text-maroon-deep"
            >
              Thêm hộp vào giỏ
            </button>
          </section>
        )}

        {/* EXPRESS — CHECKOUT 1 TRANG (đặt nhanh như TikTok) */}
        {express && step >= 2 && step <= 5 && (
          <section className="step-in">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="title-heritage text-lg">Đặt nhanh</h2>
              <button onClick={() => setStep(1)} className="text-[12px] text-gold underline">← Sửa giỏ</button>
            </div>

            {/* tóm tắt giỏ gọn */}
            <div className="rounded border border-line bg-white p-3.5">
              {cart.map((it) => (
                <div key={it.uid} className="flex items-center justify-between gap-2 border-b border-dashed border-line py-1.5 text-[12.5px] last:border-b-0">
                  <span className="min-w-0">
                    <span className="font-medium">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
                    {it.kind !== "la" && flavorNames(it.flavorIds) && (
                      <span className="block text-[10px] text-ink/55">{flavorNames(it.flavorIds)}</span>
                    )}
                  </span>
                  <div className="flex flex-none items-center gap-2">
                    <div className="inline-flex items-center overflow-hidden rounded-full border border-line">
                      <button onClick={() => setQty(it.uid, -1)} aria-label="Giảm" className="grid h-7 w-7 place-items-center text-maroon hover:bg-cream"><span className="block h-[2px] w-2.5 bg-current" /></button>
                      <span className="w-6 text-center font-serif text-[13px] tabular-nums">{it.qty}</span>
                      <button onClick={() => setQty(it.uid, 1)} aria-label="Tăng" className="grid h-7 w-7 place-items-center text-maroon hover:bg-cream"><IconPlus width={12} height={12} /></button>
                    </div>
                    <span className="font-serif text-[13px] font-semibold text-maroon-deep">{fmt(it.unitPrice * it.qty)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* thông tin nhận hàng — 1 form, ghi cả người đặt + người nhận */}
            <div className="mt-3 rounded border border-line bg-white p-3.5">
              <Label>Vùng giao · tiền tệ</Label>
              <select value={buyerRegion} onChange={(e) => setExRegion(e.target.value as Region)} className="w-full rounded border border-line bg-white p-2.5 text-sm">
                <option value="kr">🇰🇷 Ở Hàn → thanh toán ₩ KRW</option>
                <option value="vn">🇻🇳 Ở Việt Nam → thanh toán đ VND</option>
              </select>
              <div className="grid grid-cols-2 gap-2.5">
                <div><Label>Họ tên</Label><Input value={exName} onChange={setExName} placeholder="Nguyễn Văn A" /></div>
                <div><Label>SĐT · bắt buộc</Label><Input value={exPhone} onChange={setExPhone} placeholder="010-xxxx-xxxx" /></div>
              </div>
              <Label>Địa chỉ nhận</Label>
              <Input value={exAddress} onChange={(v) => r0 && setR(r0.uid, "address", v)} placeholder="Số nhà, đường, quận, thành phố" />
              <Label>Ngày muốn nhận</Label>
              <input type="date" value={exDate} onChange={(e) => r0 && setR(r0.uid, "desiredDate", e.target.value)} className="w-full rounded border border-line bg-white p-2.5 text-sm" />
              {suggestedDate && (
                <button type="button" onClick={() => r0 && setR(r0.uid, "desiredDate", suggestedDate)} className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition active:scale-95 ${exDate === suggestedDate ? "border-gold bg-gold text-maroon-deep" : "border-gold bg-[#fff8ec] text-[#b8862f] hover:bg-gold/15"}`}>
                  <IconMoon width={12} height={12} /> Trước Trung Thu 1 tuần · {suggestedDDMM}
                </button>
              )}
              <button onClick={() => { setExpress(false); if (recipients.length === 0) addRecipient(); setStep(3); }} className="mt-3 block w-full text-center text-[12px] text-gold underline">
                Gửi tặng nhiều người / nhiều địa chỉ? →
              </button>
            </div>

            {/* tổng */}
            <div className="mt-3 rounded border border-line bg-white p-3.5">
              <Row k={`Tạm tính (${cart.reduce((n, l) => n + l.qty, 0)} món)`} v={fmt(bill.subtotal)} />
              <Row k="Phí ship" v={fmt(bill.shipping)} />
              {bill.handling > 0 && <Row k="Handling chéo vùng" v={fmt(bill.handling)} />}
              <div className="mt-1.5 flex justify-between border-t-2 border-maroon pt-2.5 font-serif text-[17px] text-maroon">
                <span>Tổng · {buyerRegion === "vn" ? "VND" : "KRW"}</span>
                <span>{fmt(bill.grand)}</span>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] opacity-60">Bấm “Đặt hàng” — chuyển khoản ở bước sau.</p>
          </section>
        )}

        {/* STEP 2 — NGƯỜI ĐẶT */}
        {!express && step === 2 && (
          <section className="step-in">
            <div className="eyebrow">Bước 2</div>
            <h2 className="title-heritage mb-4 text-lg">Người đặt</h2>
            <div className="rounded border border-line bg-white p-3.5">
              <Label>Vùng đặt hàng · quyết tiền tệ</Label>
              <select
                value={buyerRegion}
                onChange={(e) => setBuyerRegion(e.target.value as Region)}
                className="w-full rounded border border-line bg-white p-2.5 text-sm"
              >
                <option value="kr">🇰🇷 Ở Hàn Quốc → thanh toán ₩ KRW</option>
                <option value="vn">🇻🇳 Ở Việt Nam → thanh toán đ VND</option>
              </select>
              <Label>Họ tên</Label>
              <Input value={buyerName} onChange={setBuyerName} placeholder="Nguyễn Văn A" />
              <Label>Số điện thoại · bắt buộc</Label>
              <Input value={buyerPhone} onChange={setBuyerPhone} placeholder="010-xxxx-xxxx" />
              <p className="mt-1.5 text-[11px] opacity-65">
                SĐT dùng để đối soát khách với Pancake &amp; tra cứu đơn về sau.
              </p>
            </div>
          </section>
        )}

        {/* STEP 3 — NGƯỜI NHẬN */}
        {!express && step === 3 && (
          <section className="step-in">
            <div className="eyebrow">Bước 3</div>
            <h2 className="title-heritage mb-4 text-lg">Người nhận &amp; chia quà</h2>
            {recipients.map((r, i) => (
              <div key={r.uid} className="mb-3 rounded border border-line border-l-[3px] border-l-gold bg-white p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">
                    Người nhận {i + 1}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm border border-line bg-cream px-2 py-0.5 text-[10px] uppercase">
                      {r.region === "kr" ? "🇰🇷 Kho Hàn" : "🇻🇳 Kho VN"}
                    </span>
                    <button
                      onClick={() => removeRecipient(r.uid)}
                      aria-label={`Xoá người nhận ${i + 1}`}
                      className="grid h-6 w-6 place-items-center rounded-full border border-line text-maroon/60 hover:border-maroon hover:bg-maroon hover:text-cream"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label>Tên</Label>
                    <Input value={r.name} onChange={(v) => setR(r.uid, "name", v)} />
                  </div>
                  <div>
                    <Label>SĐT</Label>
                    <Input value={r.phone} onChange={(v) => setR(r.uid, "phone", v)} />
                  </div>
                </div>
                <Label>Địa chỉ</Label>
                <Input value={r.address} onChange={(v) => setR(r.uid, "address", v)} />
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label>Vùng giao</Label>
                    <select
                      value={r.region}
                      onChange={(e) => setR(r.uid, "region", e.target.value)}
                      className="w-full rounded border border-line bg-white p-2.5 text-sm"
                    >
                      <option value="kr">🇰🇷 Hàn Quốc</option>
                      <option value="vn">🇻🇳 Việt Nam</option>
                    </select>
                  </div>
                  <div>
                    <Label>Ngày muốn nhận</Label>
                    <input
                      type="date"
                      value={r.desiredDate}
                      onChange={(e) => setR(r.uid, "desiredDate", e.target.value)}
                      className="w-full rounded border border-line bg-white p-2.5 text-sm"
                    />
                    {suggestedDate && (
                      <button
                        type="button"
                        onClick={() => setR(r.uid, "desiredDate", suggestedDate)}
                        className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition active:scale-95 ${r.desiredDate === suggestedDate ? "border-gold bg-gold text-maroon-deep" : "border-gold bg-[#fff8ec] text-[#b8862f] hover:bg-gold/15"}`}
                      >
                        <IconMoon width={12} height={12} /> Trước Trung Thu 1 tuần · {suggestedDDMM}
                      </button>
                    )}
                  </div>
                </div>
                <Label>Gán quà cho người này</Label>
                <p className="-mt-1 mb-1.5 text-[11px] opacity-60">Cùng một món gán cho nhiều người → mỗi người một phần, tiền tự cộng.</p>
                <div className="flex flex-wrap gap-1.5">
                  {cart.map((it) => {
                    const sel = it.recipientUids.includes(r.uid);
                    const fl = it.kind !== "la" ? flavorNames(it.flavorIds) : "";
                    return (
                      <button
                        key={it.uid}
                        onClick={() => assign(it.uid, r.uid)}
                        className={`max-w-full rounded-lg border px-2.5 py-1.5 text-left text-[11px] ${sel ? "border-maroon bg-maroon text-cream" : "border-line bg-white"}`}
                      >
                        <span className="block font-medium">
                          {sel ? "✓ " : ""}{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}
                        </span>
                        {fl && (
                          <span className={`mt-0.5 block text-[10px] leading-snug ${sel ? "text-cream/80" : "opacity-60"}`}>
                            {fl}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              onClick={addRecipient}
              className="w-full rounded border border-dashed border-line bg-cream py-3 font-serif text-xs uppercase tracking-wide text-maroon"
            >
              + Thêm người nhận
            </button>
          </section>
        )}

        {/* STEP 4 — XEM LẠI */}
        {!express && step === 4 && (
          <section className="step-in">
            <div className="eyebrow">Bước 4</div>
            <h2 className="title-heritage mb-4 text-lg">Xem lại</h2>

            {/* chi tiết hàng + địa chỉ để khách kiểm tra */}
            <div className="mb-3 rounded border border-line bg-white p-3.5">
              <div className="border-b border-dashed border-line pb-2 text-[12px]">
                <div className="flex justify-between"><span className="opacity-60">Người đặt</span><span className="font-medium">{buyerName || "—"}</span></div>
                <div className="flex justify-between"><span className="opacity-60">SĐT</span><span className="font-medium">{buyerPhone || "—"}</span></div>
              </div>
              <RecipientBlocks recipients={recipients} cart={cart} flavorNames={flavorNames} fmt={fmt} />
            </div>

            <div className="rounded border border-line bg-white p-3.5">
              <Row k={`Tạm tính (${cart.reduce((n, l) => n + l.qty * Math.max(1, l.recipientUids.length), 0)} phần)`} v={fmt(bill.subtotal)} />
              <Row k={`Phí ship`} v={fmt(bill.shipping)} />
              {bill.handling > 0 && <Row k="Phí handling chéo vùng" v={fmt(bill.handling)} />}
              <div className="mt-1.5 flex justify-between border-t-2 border-maroon pt-2.5 font-serif text-[17px] text-maroon">
                <span>Tổng · {buyerRegion === "vn" ? "VND" : "KRW"}</span>
                <span>{fmt(bill.grand)}</span>
              </div>
            </div>
            <p className="mt-2 text-[11px] opacity-65">
              Một bill · một tiền tệ theo người đặt · tách kho theo người nhận. Tỉ giá chốt 1₩ = {fx}đ.
            </p>
          </section>
        )}

        {/* STEP 6 — ĐẶT XONG → THANH TOÁN (trang riêng) */}
        {step === 6 && done && (
          <section className="step-in py-6">
            <div className="text-center">
              <div className="mx-auto mb-1 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-600 ring-1 ring-emerald-300">
                ✓
              </div>
              <h2 className="title-heritage my-2 text-xl">Đặt đơn thành công</h2>
              <p className="text-[12.5px] opacity-70">
                Mã đơn <b className="font-serif text-maroon">{done.code}</b> — chuyển khoản để hoàn tất.
              </p>
            </div>

            {/* ===== THANH TOÁN (trang riêng sau khi đặt) ===== */}
            <div className="mt-4 rounded-lg border-2 border-gold bg-[#fffdf7] p-4">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Thanh toán</span>
                <span className="font-serif text-[18px] font-bold text-maroon">{fmt(done.grandTotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded border border-gold/50 bg-white px-2.5 py-1.5 text-[12px]">
                <span className="opacity-60">Nội dung CK</span>
                <span className="flex items-center gap-2">
                  <b className="font-serif tracking-wide text-maroon-deep">{done.transferCode}</b>
                  <CopyBtn value={done.transferCode} />
                </span>
              </div>
              <p className="mt-2 text-[11px] text-[#b8862f]">Chuyển tới <b>một trong hai</b> tài khoản dưới · ghi đúng nội dung CK ở trên.</p>
              <div className="mt-3">
                <BankCard data={BANKS.vn} primary={buyerRegion === "vn"} qrUrl={vietqrUrl(buyerRegion === "vn" ? done.grandTotal : undefined)} />
                <div className="h-3" />
                <BankCard data={BANKS.kr} primary={buyerRegion === "kr"} />
              </div>
            </div>

            {/* ===== HOÁ ĐƠN (chụp/tải ảnh) ===== */}
            <div ref={receiptRef} className="rounded-lg border border-line bg-white p-4">
              <div className="border-b border-dashed border-line pb-3 text-center">
                <div className="title-heritage text-base tracking-[0.16em]">Trăng Rằm</div>
                <div className="eyebrow mt-0.5">Phiếu đặt hàng</div>
                <div className="mt-1.5 text-[12px] text-ink/70">
                  Mã đơn <b className="font-serif text-maroon">{done.code}</b> · Nội dung CK{" "}
                  <b className="font-serif text-maroon">{done.transferCode}</b>
                </div>
              </div>

              <div className="border-b border-dashed border-line py-2.5 text-[12px]">
                <div className="flex justify-between"><span className="opacity-60">Người đặt</span><span className="font-medium">{buyerName || "—"}</span></div>
                <div className="flex justify-between"><span className="opacity-60">SĐT</span><span className="font-medium">{buyerPhone || "—"}</span></div>
                {ref && (
                  <div className="flex justify-between"><span className="opacity-60">Nguồn</span><span className="font-medium text-blue-600">Messenger{refLink ? ` · ${refLink.customerName}` : ""}</span></div>
                )}
              </div>

              {/* quà theo từng người nhận */}
              <RecipientBlocks recipients={recipients} cart={cart} flavorNames={flavorNames} fmt={fmt} />
              <div className="border-b border-dashed border-line" />

              {/* tổng */}
              <div className="pt-2.5 text-[12px]">
                <div className="flex justify-between py-0.5"><span className="opacity-60">Tạm tính</span><span>{fmt(bill.subtotal)}</span></div>
                <div className="flex justify-between py-0.5"><span className="opacity-60">Phí ship</span><span>{fmt(bill.shipping)}</span></div>
                {bill.handling > 0 && <div className="flex justify-between py-0.5"><span className="opacity-60">Handling</span><span>{fmt(bill.handling)}</span></div>}
                <div className="mt-1 flex justify-between border-t-2 border-maroon pt-1.5 font-serif text-[15px] text-maroon">
                  <span>Tổng cần CK</span><span>{fmt(done.grandTotal)}</span>
                </div>
              </div>
            </div>

            {done.simulated && (
              <p className="mt-2 text-center text-[11px] opacity-60">
                (Đơn mô phỏng — chưa cấu hình Supabase nên không lưu vào DB.)
              </p>
            )}

            {/* hành động */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                onClick={downloadBill}
                className="inline-flex items-center justify-center gap-1.5 rounded border border-gold bg-white px-4 py-3 font-serif text-xs font-semibold uppercase tracking-wide text-maroon transition active:scale-95 hover:bg-cream"
              >
                ⤓ Tải ảnh bill
              </button>
              <a
                href="/tra-cuu"
                className="inline-flex items-center justify-center rounded bg-gold px-4 py-3 font-serif text-xs font-semibold uppercase tracking-wide text-maroon-deep transition active:scale-95"
              >
                Theo dõi đơn
              </a>
            </div>
            <a href="/le" className="mt-2.5 block text-center text-[12px] text-gold underline">← Về trang chủ</a>
          </section>
        )}
      </div>

      {/* toast copy Zalo */}
      {zaloHint && (
        <div className="fixed inset-x-0 bottom-[68px] z-30 mx-auto max-w-app px-4">
          <div className="rounded-lg border border-gold bg-[#fff8ec] px-3 py-2 text-center text-[12px] text-[#b8862f] shadow">
            Đã copy nội dung đơn — dán vào khung chat Zalo rồi gửi nhé.
          </div>
        </div>
      )}

      {/* navbar EXPRESS — thanh mua dính đáy, có giá + đặt nhanh + Zalo */}
      {express && step >= 2 && step <= 5 && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-app items-center gap-2 border-t border-line bg-cream px-3 py-2.5">
          <div className="flex-1 leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-maroon/60">Tổng cộng</span>
            <b className="block font-serif text-[17px] text-maroon">{fmt(bill.grand)}</b>
          </div>
          <button
            onClick={orderViaZalo}
            className="rounded-lg border border-gold px-3 py-2.5 text-[12px] font-semibold text-maroon"
          >
            💬 Zalo
          </button>
          <button
            onClick={expressSubmit}
            disabled={submitting}
            className="rounded-lg bg-gold px-5 py-2.5 font-serif text-xs font-bold uppercase tracking-wide text-maroon-deep disabled:opacity-40"
          >
            {submitting ? "Đang tạo…" : "Đặt hàng"}
          </button>
        </div>
      )}

      {/* navbar thường (wizard) — cả khi express đang ở bước 1 (sửa giỏ) */}
      {(!express || step === 1) && step !== 6 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-app items-center gap-2.5 border-t border-line bg-cream px-4 py-3">
          <div className="flex-1 text-[11px] uppercase tracking-wide opacity-70">
            Tạm tính<span className="normal-case tracking-normal opacity-70"> (chưa gồm ship)</span>
            <b className="block font-serif text-[17px] normal-case tracking-normal text-maroon">
              {fmt(bill.subtotal)}
            </b>
          </div>
          {step > 1 && (
            <button
              onClick={() => setStep(step === 1.5 ? 1 : Math.floor(step) - 1)}
              className="rounded border border-line px-5 py-3 font-serif text-xs font-semibold uppercase tracking-widest text-maroon"
            >
              Lùi
            </button>
          )}
          {step !== 1.5 && (
            <button
              onClick={next}
              disabled={submitting}
              className="rounded bg-gold px-5 py-3 font-serif text-xs font-semibold uppercase tracking-widest text-maroon-deep disabled:opacity-40"
            >
              {step === 4 ? (submitting ? "Đang tạo…" : "Đặt hàng") : "Tiếp"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 mt-3 block font-serif text-[11px] font-semibold uppercase tracking-wide text-maroon">
      {children}
    </label>
  );
}
function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-line bg-white p-2.5 text-sm"
    />
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-dashed border-line py-2 text-[13px]">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition active:scale-95 ${ok ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-line bg-white text-maroon hover:bg-cream"}`}
    >
      {ok ? <IconCheck width={12} height={12} /> : <IconCopyDoc width={12} height={12} />}
      {ok ? "Đã copy" : "Copy"}
    </button>
  );
}

function BankCard({
  data,
  primary,
  qrUrl,
}: {
  data: { title: string; bank: string; number: string; holder: string };
  primary?: boolean;
  qrUrl?: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${primary ? "border-gold bg-[#fffdf7]" : "border-line bg-white"}`}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-maroon">{data.title}</span>
        {primary && (
          <span className="rounded-sm bg-gold px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-maroon-deep">Nên dùng</span>
        )}
      </div>

      {qrUrl && (
        <div className="mt-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="Mã QR chuyển khoản" className="mx-auto h-44 w-44 rounded border border-line bg-white object-contain" />
          <div className="mt-2 flex justify-center">
            <a
              href={qrUrl}
              download="trang-ram-qr.png"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-gold bg-white px-3.5 py-1.5 text-[12px] font-medium text-maroon transition active:scale-95 hover:bg-cream"
            >
              ⤓ Tải mã QR
            </a>
          </div>
          <p className="mt-1 text-[10.5px] opacity-55">Quét bằng app ngân hàng · hoặc chụp màn hình lại</p>
        </div>
      )}

      <div className="mt-3 space-y-2 text-[13px]">
        <KV k="Ngân hàng" v={data.bank} />
        <div className="flex items-center justify-between gap-2">
          <span className="opacity-60">Số tài khoản</span>
          <span className="flex items-center gap-2">
            <b className="font-serif tracking-wide text-maroon-deep">{data.number}</b>
            <CopyBtn value={data.number.replace(/\s/g, "")} />
          </span>
        </div>
        <KV k="Chủ tài khoản" v={data.holder} />
      </div>
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="opacity-60">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

// Danh sách quà theo từng người nhận (kèm địa chỉ, ngày) — dùng ở Xem lại & Hoá đơn.
function RecipientBlocks({
  recipients,
  cart,
  flavorNames,
  fmt,
}: {
  recipients: { uid: string; name: string; phone: string; address: string; region: Region; desiredDate: string }[];
  cart: CartLine[];
  flavorNames: (ids?: string[]) => string;
  fmt: (v: number) => string;
}) {
  return (
    <>
      {recipients.map((r, i) => {
        const items = cart.filter((it) => it.recipientUids.includes(r.uid));
        if (!items.length) return null;
        return (
          <div key={r.uid} className="border-b border-dashed border-line py-2.5 last:border-b-0">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-serif font-semibold uppercase tracking-wide text-maroon">
                Người nhận {i + 1}: {r.name || "—"}
              </span>
              <span className="text-[10px] uppercase opacity-60">{r.region === "kr" ? "🇰🇷 Kho Hàn" : "🇻🇳 Kho VN"}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-ink/70">
              SĐT {r.phone || "—"} · {r.address || "—"}
              {r.desiredDate ? ` · nhận ${r.desiredDate.slice(8, 10)}/${r.desiredDate.slice(5, 7)}/${r.desiredDate.slice(0, 4)}` : ""}
            </div>
            <div className="mt-1.5 space-y-1">
              {items.map((it) => (
                <div key={it.uid} className="flex items-start justify-between gap-2 text-[12px]">
                  <span className="min-w-0">
                    <span className="font-medium">{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
                    {it.kind !== "la" && flavorNames(it.flavorIds) && (
                      <span className="block text-[10px] text-ink/55">{flavorNames(it.flavorIds)}</span>
                    )}
                  </span>
                  <span className="flex-none font-serif text-maroon-deep">{fmt(it.unitPrice * it.qty)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
