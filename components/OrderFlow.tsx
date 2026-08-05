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
import { normalizePhone } from "@/lib/phone";

const CART_KEY = "tr_cart";

type Recipient = {
  uid: string;
  name: string;
  phone: string;
  address: string;
  region: Region;
  desiredDate: string;
};

export type InitialSelection = { box?: string; combo?: string; la?: string; region?: string };

let _id = 0;
const nid = () => "u" + ++_id;

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
  const [buyerRegion, setBuyerRegion] = useState<Region>(initial?.region === "vn" ? "vn" : "kr");
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

  const addCombo = (comboId: string) => {
    const c = combos.find((x) => x.id === comboId);
    if (!c) return;
    const b = boxes.find((x) => x.id === c.box_id) ?? boxes[0];
    const unit = boxPrice(b, c.flavor_ids, flavors, buyerRegion);
    setCart((cart) => [
      ...cart,
      { uid: nid(), kind: "combo", boxId: b.id, comboId: c.id, flavorIds: c.flavor_ids, qty: 1, unitPrice: unit, name: c.name, recipientUid: null },
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
        { uid: nid(), kind: "la", flavorIds: [f.id], qty: 1, unitPrice: unit, name: f.name + " (lẻ)", recipientUid: null },
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
      }
      // dọn URL sau khi nhận deep-link → F5 sẽ khôi phục giỏ đã lưu thay vì lặp lại
      try { window.history.replaceState({}, "", "/dat-hang"); } catch { /* ignore */ }
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
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lưu giỏ để F5 không mất
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ cart, buyerRegion, buyerName, buyerPhone, recipients }));
    } catch {
      /* ignore */
    }
  }, [cart, buyerRegion, buyerName, buyerPhone, recipients]);

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
        recipientUid: null,
      },
    ]);
    setPicks([]);
    setOpenSlot(0);
    setStep(1);
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
  function assign(itemUid: string, rUid: string) {
    setCart((c) =>
      c.map((it) =>
        it.uid === itemUid
          ? { ...it, recipientUid: it.recipientUid === rUid ? null : rUid }
          : it,
      ),
    );
  }

  // ---- submit ----
  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buyer: { name: buyerName, phone: buyerPhone, region: buyerRegion },
          recipients: recipients.map((r) => ({
            uid: r.uid,
            name: r.name,
            phone: r.phone,
            address: r.address,
            region: r.region,
            desiredDate: r.desiredDate,
          })),
          lines: cart.map((l) => ({
            kind: l.kind,
            boxId: l.boxId,
            comboId: l.comboId,
            flavorIds: l.flavorIds,
            qty: l.qty,
            recipientUid: l.recipientUid,
          })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error ?? "Tạo đơn thất bại.");
        return;
      }
      // trừ kho theo BOM (demo, dùng chung kho với dashboard)
      applyStock(cartConsume(cart), -1);
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
      });
      try { localStorage.removeItem(CART_KEY); } catch { /* ignore */ }
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
      if (cart.some((it) => !it.recipientUid))
        return alert("Còn món chưa gán người nhận.");
      if (recipients.some((r) => !r.name.trim() || !r.address.trim()))
        return alert("Người nhận thiếu tên hoặc địa chỉ.");
      return setStep(4);
    }
    if (step === 4) return setStep(5);
    if (step === 5) return submit();
  }

  const STEPS = ["Giỏ", "Người đặt", "Người nhận", "Xem lại", "Thanh toán"];

  return (
    <main className="mx-auto min-h-screen max-w-app bg-cream pb-28 shadow-2xl">
      <header className="bg-maroon-deep px-4 py-3.5 text-center">
        <div className="title-heritage text-base tracking-[0.18em] text-cream">Trăng Rằm</div>
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
          <section>
            <div className="eyebrow">Bước 1</div>
            <h2 className="title-heritage mb-4 text-lg">Giỏ hàng</h2>
            {cart.length === 0 ? (
              <div className="rounded border border-line bg-white p-4 text-center opacity-60">
                Giỏ trống — thêm hộp tự chọn bên dưới.
              </div>
            ) : (
              cart.map((it) => (
                <div key={it.uid} className="mb-3 rounded border border-line bg-white p-3.5">
                  <div className="flex justify-between">
                    <div>
                      <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">
                        {it.name}
                      </div>
                      <div className="mt-1 text-xs opacity-70">
                        {(it.flavorIds ?? [])
                          .map((id) => flavors.find((f) => f.id === id)?.name)
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                      {it.kind === "la" && (
                        <div className="mt-2 inline-flex items-center rounded border border-line">
                          <button onClick={() => setQty(it.uid, -1)} className="px-2.5 py-1 text-maroon">−</button>
                          <span className="w-7 text-center font-serif text-sm">{it.qty}</span>
                          <button onClick={() => setQty(it.uid, 1)} className="px-2.5 py-1 text-maroon">+</button>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-serif font-semibold text-maroon-deep">
                        {fmt(it.unitPrice * it.qty)}
                      </span>
                      <button
                        onClick={() => setCart((c) => c.filter((x) => x.uid !== it.uid))}
                        className="mt-1.5 block text-xs text-maroon opacity-60"
                      >
                        🗑 Xoá
                      </button>
                    </div>
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
          <section>
            <div className="eyebrow">Hộp tự chọn</div>
            <h2 className="title-heritage mb-4 text-lg">Lấp từng ô</h2>
            <div className="rounded border border-line bg-white p-3.5">
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
                  return (
                    <button
                      key={i}
                      onClick={() => setOpenSlot(i)}
                      className={`flex aspect-square flex-col items-center justify-center rounded border p-1 text-[11px] ${f ? "border-gold bg-white" : "border-dashed border-line bg-cream"} ${openSlot === i ? "ring-1 ring-gold" : ""}`}
                    >
                      <span className="text-lg text-gold">{f ? "✦" : "＋"}</span>
                      {f ? f.name : `Ô ${i + 1}`}
                    </button>
                  );
                })}
              </div>
              <div className="eyebrow">Chọn vị cho ô đang mở</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {flavors.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => pick(f.id)}
                    className={`rounded-full border px-2.5 py-1.5 text-[11px] ${f.premium ? "border-gold text-maroon" : "border-line"} bg-white`}
                  >
                    {f.name}
                    {f.premium && (
                      <span className="ml-1 text-[10px] text-gold">
                        +{fmt(flavorSurcharge(f, buyerRegion))}
                      </span>
                    )}
                  </button>
                ))}
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

        {/* STEP 2 — NGƯỜI ĐẶT */}
        {step === 2 && (
          <section>
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
        {step === 3 && (
          <section>
            <div className="eyebrow">Bước 3</div>
            <h2 className="title-heritage mb-4 text-lg">Người nhận &amp; chia quà</h2>
            {recipients.map((r, i) => (
              <div key={r.uid} className="mb-3 rounded border border-line border-l-[3px] border-l-gold bg-white p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-serif text-[13px] uppercase tracking-wide text-maroon">
                    Người nhận {i + 1}
                  </div>
                  <span className="rounded-sm border border-line bg-cream px-2 py-0.5 text-[10px] uppercase">
                    {r.region === "kr" ? "🇰🇷 Kho Hàn" : "🇻🇳 Kho VN"}
                  </span>
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
                  </div>
                </div>
                <Label>Gán quà cho người này</Label>
                <div className="flex flex-wrap gap-1.5">
                  {cart.map((it) => (
                    <button
                      key={it.uid}
                      onClick={() => assign(it.uid, r.uid)}
                      className={`rounded-full border px-2.5 py-1.5 text-[11px] ${it.recipientUid === r.uid ? "border-maroon bg-maroon text-cream" : "border-line bg-white"}`}
                    >
                      {it.name}
                    </button>
                  ))}
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
        {step === 4 && (
          <section>
            <div className="eyebrow">Bước 4</div>
            <h2 className="title-heritage mb-4 text-lg">Xem lại</h2>
            <div className="rounded border border-line bg-white p-3.5">
              <Row k={`Tạm tính (${cart.length} món)`} v={fmt(bill.subtotal)} />
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

        {/* STEP 5 — THANH TOÁN */}
        {step === 5 && (
          <section>
            <div className="eyebrow">Bước 5</div>
            <h2 className="title-heritage mb-4 text-lg">Chuyển khoản</h2>
            <div className="rounded border border-line bg-white p-4 text-center">
              <div
                className="mx-auto my-2 flex h-44 w-44 items-center justify-center rounded border border-line"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg,#2b1a16 0 6px,transparent 6px 12px)",
                }}
              >
                QR
              </div>
              <p className="text-[11px] opacity-65">
                {buyerRegion === "vn" ? "VietQR · napas247" : "QR Toss / chuyển khoản Hàn"}
              </p>
            </div>
            <p className="mt-3 text-center text-sm">
              Số tiền: <b className="font-serif text-maroon">{fmt(bill.grand)}</b>
            </p>
            <div className="mt-3 rounded border border-gold bg-[#fff8ec] p-3 text-xs text-[#b8862f]">
              ⚠ Bấm xác nhận để tạo đơn &amp; sinh mã đối soát; ghi đúng mã ở nội dung CK.
            </div>
          </section>
        )}

        {/* STEP 6 — XONG */}
        {step === 6 && done && (
          <section className="py-8 text-center">
            <div className="text-5xl text-gold">✦</div>
            <h2 className="title-heritage my-3 text-xl">Đã nhận đơn</h2>
            <p className="text-sm opacity-80">
              Mã đơn <b className="font-serif">{done.code}</b> · Nội dung CK{" "}
              <b className="font-serif">{done.transferCode}</b>
            </p>
            <p className="mt-1 text-sm">
              Số tiền cần CK: <b className="font-serif text-maroon">{fmt(done.grandTotal)}</b>
            </p>
            {done.simulated && (
              <p className="mt-3 text-[11px] opacity-60">
                (Đơn mô phỏng — chưa cấu hình Supabase nên không lưu vào DB.)
              </p>
            )}
            <a
              href="/tra-cuu"
              className="mt-5 inline-block rounded bg-gold px-6 py-3 font-serif text-xs font-semibold uppercase tracking-widest text-maroon-deep"
            >
              Theo dõi đơn
            </a>
          </section>
        )}
      </div>

      {/* navbar */}
      {step !== 6 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-app items-center gap-2.5 border-t border-line bg-cream px-4 py-3">
          <div className="flex-1 text-[11px] uppercase tracking-wide opacity-70">
            Tạm tính
            <b className="block font-serif text-[17px] normal-case tracking-normal text-maroon">
              {fmt(bill.grand || cart.reduce((a, i) => a + i.unitPrice * i.qty, 0))}
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
              {step === 5 ? (submitting ? "Đang tạo…" : "Xác nhận") : "Tiếp"}
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
