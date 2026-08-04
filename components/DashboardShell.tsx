"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  IconChart,
  IconReceipt,
  IconShirt,
  IconBoxes,
  IconDollar,
  IconUsers,
  IconGear,
  IconPanelLeft,
} from "@/components/icons";

const NAV = [
  { href: "/dashboard", label: "Tổng quan", Icon: IconChart },
  { href: "/dashboard/don-hang", label: "Đơn hàng", Icon: IconReceipt },
  { href: "/dashboard/san-pham", label: "Sản phẩm", Icon: IconShirt },
  { href: "/dashboard/ton-kho", label: "Tồn kho", Icon: IconBoxes },
  { href: "/dashboard/thu-chi", label: "Thu chi", Icon: IconDollar },
  { href: "/dashboard/khach-hang", label: "Khách hàng", Icon: IconUsers },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside
        className={`sticky top-0 flex h-screen flex-col border-r border-slate-200 bg-white transition-all ${collapsed ? "w-[68px]" : "w-56"}`}
      >
        {/* logo */}
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-4">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-blue-600 text-[13px] font-bold text-white">
            TR
          </span>
          {!collapsed && <span className="truncate font-semibold text-slate-800">Trăng Rằm</span>}
        </div>

        {/* nav */}
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <a
                key={href}
                href={href}
                title={label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                  active ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <Icon width={19} height={19} className="flex-none" />
                {!collapsed && <span className="truncate">{label}</span>}
              </a>
            );
          })}
        </nav>

        {/* bottom */}
        <div className="space-y-1 border-t border-slate-100 p-3">
          <a
            href="#"
            title="Cài đặt"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-500 hover:bg-slate-50 ${collapsed ? "justify-center" : ""}`}
          >
            <IconGear width={19} height={19} className="flex-none" />
            {!collapsed && <span>Cài đặt</span>}
          </a>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Mở rộng" : "Thu gọn"}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-400 hover:bg-slate-50 ${collapsed ? "justify-center" : ""}`}
          >
            <IconPanelLeft width={19} height={19} className="flex-none" />
            {!collapsed && <span>Thu gọn</span>}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
