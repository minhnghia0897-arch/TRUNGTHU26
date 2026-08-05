"use client";

import { useEffect, useState } from "react";
import { getLinks, addLink, removeLink, LINKS_KEY, type OrderLink } from "@/lib/attribution";
import { IconFacebook, IconCopyDoc, IconCheck, IconTrash } from "@/components/icons";

export default function MessengerLinks() {
  const [links, setLinks] = useState<OrderLink[]>([]);
  const [origin, setOrigin] = useState("");
  const [name, setName] = useState("");
  const [psid, setPsid] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setLinks(getLinks());
    setOrigin(window.location.origin);
    const onChange = (e: StorageEvent) => {
      if (!e.key || e.key === LINKS_KEY) setLinks(getLinks());
    };
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  const linkFor = (token: string) => `${origin}/dat-hang?ref=${token}`;

  const create = () => {
    if (!name.trim()) return;
    addLink({ customerName: name, psid, phone });
    setLinks(getLinks());
    setName("");
    setPsid("");
    setPhone("");
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(token));
    } catch {
      /* ignore */
    }
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
  };

  const del = (token: string) => {
    removeLink(token);
    setLinks(getLinks());
  };

  const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400";

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-5">
        <IconFacebook width={18} height={18} className="text-blue-600" />
        <h1 className="text-[15px] font-semibold text-slate-800">Link Messenger (định danh khách)</h1>
      </header>

      <div className="mx-auto max-w-[900px] space-y-5 p-5">
        <p className="text-[13px] text-slate-500">
          Mô phỏng luồng <b>§10.1</b>: tạo link đặt hàng gắn <b>token</b> cho một khách trong Messenger → gửi khách →
          khi khách đặt, đơn tự gắn đúng khách (PSID / Pancake). Demo lưu ở trình duyệt này.
        </p>

        {/* tạo link */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-[14px] font-semibold text-slate-800">Tạo link cho khách</div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-slate-500">Tên khách (Messenger)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Chị Lan FB" className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-slate-500">PSID (tuỳ chọn)</span>
              <input value={psid} onChange={(e) => setPsid(e.target.value)} placeholder="tự sinh nếu để trống" className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-slate-500">SĐT (tuỳ chọn)</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="để đối soát" className={inp} />
            </label>
          </div>
          <button
            onClick={create}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
          >
            + Tạo link có token
          </button>
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
