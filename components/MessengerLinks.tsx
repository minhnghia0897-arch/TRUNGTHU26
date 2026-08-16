"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrderLink } from "@/lib/orders/links";
import { parseConversationLink, parseCustomerId, parsePageId } from "@/lib/messenger";

// Link nằm trong DATABASE, không phải localStorage. Bản cũ lưu ở trình duyệt
// máy shop nên khách bấm link từ máy họ là mất dấu — tính năng không chạy.
const API = "/api/dashboard/links";
import { IconFacebook, IconCopyDoc, IconCheck, IconTrash } from "@/components/icons";

export default function MessengerLinks() {
  const [links, setLinks] = useState<OrderLink[]>([]);
  const [origin, setOrigin] = useState("");
  const [name, setName] = useState("");
  const [psid, setPsid] = useState(""); // ID khách HOẶC link hội thoại
  const [phone, setPhone] = useState("");
  const [bulk, setBulk] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [pageId, setPageId] = useState("");
  const [pageSaved, setPageSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(API);
      const data = (await res.json()) as {
        ok: boolean;
        links?: OrderLink[];
        pageId?: string;
        error?: string;
      };
      if (!data.ok) throw new Error(data.error ?? "Không đọc được link.");
      setLinks(data.links ?? []);
      setPageId(data.pageId ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được link.");
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void reload();
  }, [reload]);

  const send = async (body: unknown, method: "POST" | "DELETE") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(API, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Không lưu được.");
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const linkFor = (token: string) => `${origin}/dat-hang?ref=${token}`;

  /**
   * Bóc `{{ }}` và mọi ký tự không phải số ngay khi gõ.
   *
   * Link mẫu ghi `?ref={{customer_id}}`; làm tay thì hay thay chữ customer_id
   * bằng con số mà GIỮ LẠI cặp ngoặc. Giá trị `{{123}}` vào database rồi link
   * mở chat hỏng — Facebook không đọc được nên mở hộp thư chung.
   */
  /**
   * Ô này nhận BẤT KỲ thứ gì copy được: link hội thoại Pancake, đường dẫn hộp
   * thư Business Suite, số trần, hay UUID. Bắt người ta tự chọn đúng loại là
   * chỗ đã hỏng bốn lượt liên tiếp.
   */
  const cleanId = (v: string) => (parseConversationLink(v) ? v.trim() : parseCustomerId(v));
  const convLink = parseConversationLink(psid);

  const create = async () => {
    if (!name.trim()) return;
    // ID Trang và ID khách nằm cạnh nhau trong cùng đường dẫn hộp thư nên rất
    // dễ copy nhầm — mà nhầm thì link mở chat không bao giờ đúng ai.
    if (!convLink && psid && psid === pageId) {
      setError(
        "Số vừa dán là ID Trang, không phải ID khách. Mở cuộc chat của khách trong hộp thư rồi copy selected_item_id.",
      );
      return;
    }
    if (await send({ customerName: name, psid, phone }, "POST")) {
      setName("");
      setPsid("");
      setPhone("");
    }
  };

  const createBulk = async () => {
    const names = bulk.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    for (const n of names) await send({ customerName: n }, "POST");
    setBulk("");
  };

  const templateLink = origin ? `${origin}/dat-hang?ref={{customer_id}}` : "";

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };
  const copy = (token: string) => copyText(linkFor(token), token);

  const del = (token: string) => void send({ token }, "DELETE");

  const savePageId = async () => {
    if (await send({ pageId }, "POST")) setPageSaved(true);
  };

  const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400";
  const banner = error ? (
    <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</div>
  ) : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <IconFacebook width={18} height={18} className="text-blue-600" />
        <h1 className="text-[15px] font-semibold text-slate-800">Link Messenger (định danh khách)</h1>
      </header>

      <div className="mx-auto max-w-[900px] space-y-5 p-5">
        {banner}

        {/* ID Trang — không có thì từ đơn không bấm sang cuộc chat được */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-[14px] font-semibold text-slate-800">ID Trang Facebook</h2>
          <p className="mb-2 text-[12.5px] text-slate-500">
            <b>Dán cả đường dẫn hộp thư vào đây cũng được</b> — ô này tự moi ID Trang ra. Có ID
            Trang thì màn hình đơn hàng mới bấm được sang đúng cuộc chat. Hoặc lấy ID ở{" "}
            <a
              href="https://business.facebook.com/settings/pages"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              Meta Business Suite → Trang
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={pageId}
              onChange={(e) => {
                setPageId(e.target.value);
                setPageSaved(false);
              }}
              placeholder="VD: 1234567890"
              className={`${inp} max-w-xs`}
            />
            <button
              onClick={() => void savePageId()}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Lưu
            </button>
            {pageSaved && (
              <span className="self-center text-[12.5px] font-medium text-emerald-600">Đã lưu</span>
            )}
          </div>
        </section>
        <p className="text-[13px] text-slate-500">
          Tạo link đặt hàng gắn <b>token</b> cho một khách trong Messenger → gửi khách → khi khách
          đặt, máy chủ tra token và gắn đúng khách vào đơn. Link lưu trong cơ sở dữ liệu nên mở ở
          máy nào cũng dùng được.
        </p>

        {/* CÁCH NHANH — link mẫu dán 1 lần */}
        <section className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Nên dùng</span>
            <span className="text-[14px] font-semibold text-slate-800">Link mẫu — dán 1 lần cho mọi khách</span>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            Chỉ dán vào <b>kịch bản trả lời tự động</b> Pancake/Botcake — hệ thống tự thay{" "}
            <code className="rounded bg-white px-1">{"{{customer_id}}"}</code> bằng mã từng khách,
            1000 khách không phải tạo link nào. <b>Đừng tự thay bằng tay</b>: thay số mà giữ lại
            cặp <code className="rounded bg-white px-1">{"{{ }}"}</code> là link mở chat hỏng.
            Làm tay thì dùng ô "Tạo link có token" bên dưới.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-blue-200 bg-white px-3 py-2 text-[12px] text-slate-700">{templateLink}</code>
            <button
              onClick={() => copyText(templateLink, "tpl")}
              className={`inline-flex flex-none items-center gap-1 rounded-lg border px-3 py-2 text-[12px] font-medium transition ${copied === "tpl" ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-blue-300 bg-white text-blue-700 hover:bg-blue-50"}`}
            >
              {copied === "tpl" ? <IconCheck width={13} height={13} /> : <IconCopyDoc width={13} height={13} />}
              {copied === "tpl" ? "Đã copy" : "Copy link mẫu"}
            </button>
          </div>
        </section>

        {/* tạo hàng loạt */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-1 text-[14px] font-semibold text-slate-800">Tạo hàng loạt (dán danh sách)</div>
          <p className="mb-2 text-[12px] text-slate-500">Mỗi dòng một tên khách — mô phỏng sinh token tự động khi gửi broadcast.</p>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={3}
            placeholder={"Chị Lan FB\nAnh Minh\nBé Na"}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400"
          />
          <button
            onClick={() => void createBulk()}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
          >
            + Tạo hàng loạt
          </button>
        </section>

        {/* tạo link lẻ */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-[14px] font-semibold text-slate-800">Tạo link cho 1 khách (để test)</div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-slate-500">Tên khách (Messenger)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Chị Lan FB" className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-slate-500">
                ID khách (<code className="rounded bg-slate-100 px-1">selected_item_id</code>)
              </span>
              <input
                value={psid}
                onChange={(e) => setPsid(cleanId(e.target.value))}
                placeholder="dán link hội thoại Pancake, đường dẫn hộp thư, hoặc mã khách"
                className={inp}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-slate-500">SĐT (tuỳ chọn)</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="để đối soát" className={inp} />
            </label>
          </div>
          <button
            onClick={() => void create()}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
          >
            + Tạo link có token
          </button>
          <p className="mt-2 text-[11.5px] text-slate-400">
            Ô trên nhận mọi thứ anh copy được: <b>link hội thoại Pancake</b> (tốt nhất — dùng
            thẳng, khỏi cần ID Trang), đường dẫn hộp thư Business Suite (tự lấy đúng{" "}
            <code className="rounded bg-slate-100 px-1">selected_item_id</code>, bỏ qua hai số ID
            Trang nằm cạnh), hoặc mã khách dạng số / UUID.
          </p>
        </section>

        {/* danh sách link */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-[14px] font-semibold text-slate-800">
            Link đã tạo <span className="text-[12px] font-normal text-slate-400">({links.length})</span>
          </div>
          {links.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-slate-400">Chưa có link nào — tạo ở trên.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5">Khách</th>
                    <th className="px-4 py-2.5">PSID</th>
                    <th className="px-4 py-2.5">Link (token)</th>
                    <th className="px-4 py-2.5 text-center">Trạng thái</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {links.map((l) => (
                    <tr key={l.token}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{l.customerName}</div>
                        {l.phone && <div className="text-[11px] text-slate-400">{l.phone}</div>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{l.psid}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <code className="max-w-[280px] truncate rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{linkFor(l.token)}</code>
                          <button
                            onClick={() => copy(l.token)}
                            className={`inline-flex flex-none items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition ${copied === l.token ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                          >
                            {copied === l.token ? <IconCheck width={12} height={12} /> : <IconCopyDoc width={12} height={12} />}
                            {copied === l.token ? "Đã copy" : "Copy"}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {l.usedByOrder ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Đã có đơn {l.usedByOrder}</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Chưa dùng</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => del(l.token)} title="Xoá link" className="rounded-lg px-2 py-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500">
                          <IconTrash width={15} height={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[12px] text-slate-400">
          Bản thật: token map tới <b>pancake_customer_id</b> của hội thoại (đọc qua Pancake Chat API); backend gắn khách vào đơn và tự đẩy đơn POS khi thanh toán (§10.2).
        </p>
      </div>
    </main>
  );
}
