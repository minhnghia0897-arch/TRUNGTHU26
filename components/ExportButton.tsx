"use client";

import { useEffect, useRef, useState } from "react";
import { buildXlsx, downloadBlob, type SheetSpec } from "@/lib/xlsx";
import { isDriveConfigured, saveToDrive, forgetDriveToken } from "@/lib/googleDrive";
import { IconDownload, IconSheet, IconDrive, IconChevronDown } from "@/components/icons";

interface Props {
  /** Dựng dữ liệu sheet tại thời điểm bấm (để luôn lấy bộ lọc hiện tại). */
  build: () => { sheets: SheetSpec[]; fileName: string };
  /** Số dòng sẽ xuất — hiện trên nút cho anh biết đang xuất bao nhiêu. */
  count: number;
  label?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "working"; what: string }
  | { kind: "done"; text: string; href?: string }
  | { kind: "error"; text: string };

export default function ExportButton({ build, count, label = "Xuất Excel" }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // thông báo thành công tự ẩn sau một lúc
  useEffect(() => {
    if (state.kind !== "done") return;
    const t = setTimeout(() => setState({ kind: "idle" }), 12_000);
    return () => clearTimeout(t);
  }, [state]);

  const disabled = count === 0 || state.kind === "working";

  const doDownload = () => {
    setOpen(false);
    try {
      const { sheets, fileName } = build();
      downloadBlob(buildXlsx(sheets), fileName);
      setState({ kind: "done", text: `Đã tải ${count} dòng về máy.` });
    } catch (e) {
      setState({ kind: "error", text: e instanceof Error ? e.message : "Không tạo được file." });
    }
  };

  const doDrive = async () => {
    setOpen(false);
    if (!isDriveConfigured()) {
      setState({
        kind: "error",
        text: "Chưa nối Google Drive — cần thêm NEXT_PUBLIC_GOOGLE_CLIENT_ID (xem docs/google-drive.md).",
      });
      return;
    }
    setState({ kind: "working", what: "Đang tải lên Google Drive…" });
    try {
      const { sheets, fileName } = build();
      const file = await saveToDrive(fileName, buildXlsx(sheets));
      setState({
        kind: "done",
        text: `Đã lưu "${file.name}" vào Drive.`,
        href: file.webViewLink,
      });
    } catch (e) {
      forgetDriveToken();
      setState({ kind: "error", text: e instanceof Error ? e.message : "Lưu Drive thất bại." });
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={count === 0 ? "Không có đơn nào để xuất" : `Xuất ${count} dòng`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IconSheet width={15} height={15} className="text-emerald-600" />
        {state.kind === "working" ? "Đang xuất…" : label}
        {count > 0 && state.kind !== "working" && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
            {count}
          </span>
        )}
        <IconChevronDown width={13} height={13} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            onClick={doDownload}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
          >
            <IconDownload width={16} height={16} className="flex-none text-slate-400" />
            <span>
              Tải về máy
              <span className="block text-[11px] text-slate-400">File .xlsx mở bằng Excel</span>
            </span>
          </button>
          <button
            onClick={doDrive}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
          >
            <IconDrive className="flex-none" />
            <span>
              Lưu vào Google Drive
              <span className="block text-[11px] text-slate-400">
                Vào thư mục “Doran King — Xuất dữ liệu”
              </span>
            </span>
          </button>
        </div>
      )}

      {state.kind !== "idle" && state.kind !== "working" && (
        <div
          className={`absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border px-3 py-2 text-[12px] shadow-sm ${
            state.kind === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="flex-1">{state.text}</span>
            <button
              onClick={() => setState({ kind: "idle" })}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
          {state.kind === "done" && state.href && (
            <a
              href={state.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-medium underline"
            >
              Mở file trên Drive →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
