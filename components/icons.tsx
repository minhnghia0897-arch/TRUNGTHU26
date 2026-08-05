// Bộ icon SVG tinh gọn (stroke mảnh 1.5), dùng currentColor.
import type { SVGProps } from "react";

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconLotus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 21c-4 0-7-2.2-7-5 1.5.6 3 .7 4.3.3" />
    <path d="M12 21c4 0 7-2.2 7-5-1.5.6-3 .7-4.3.3" />
    <path d="M12 21c-2.2-1.4-3.5-3.6-3.5-6.2 0-2.4 1.3-4.6 3.5-6.3 2.2 1.7 3.5 3.9 3.5 6.3 0 2.6-1.3 4.8-3.5 6.2Z" />
  </svg>
);

export const IconGift = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v8h14v-8M12 8v12" />
    <path d="M12 8S10.5 4 8 4 5 6 5 6.5 6 8 8 8h4Zm0 0s1.5-4 4-4 3 2 3 2.5S18 8 16 8h-4Z" />
  </svg>
);

export const IconGrid = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
);

export const IconCart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 4h2l2.2 11.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 7H6" />
    <circle cx="9" cy="20" r="1.2" />
    <circle cx="18" cy="20" r="1.2" />
  </svg>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4 4 10-10" />
  </svg>
);

export const IconCrown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 8l3.2 3.2L12 5l4.8 6.2L20 8l-1.4 10H5.4L4 8Z" />
  </svg>
);

export const IconMoon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </svg>
);

export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L7.5 18l.9-5L4.8 9.8l5-.7L12 4.5Z" />
  </svg>
);

export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconFacebook = (p: SVGProps<SVGSVGElement>) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
  </svg>
);

export const IconGlobe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </svg>
);

export const IconStore = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 9V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3M4 9l-1 3h18l-1-3M4 9h16M5 12v7h14v-7" />
  </svg>
);

export const IconTruck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17.5" cy="18" r="1.6" />
  </svg>
);

export const IconDollar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.5 9.2C14 8.4 13.1 8 12 8c-1.4 0-2.5.7-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.3-1.1 2-2.5 2-1.1 0-2-.4-2.5-1.2M12 6.8v10.4" />
  </svg>
);

export const IconXCircle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </svg>
);

export const IconReturn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1" />
  </svg>
);

export const IconCopyDoc = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const IconReceipt = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M6 3h12v18l-3-1.5L12 21l-3-1.5L6 21V3Z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

export const IconShirt = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M8 3 4 6l2 3 2-1.5V21h8V7.5L18 9l2-3-4-3-2 2H10L8 3Z" />
  </svg>
);

export const IconBoxes = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 8.5 7.5 6 12 8.5 7.5 11 3 8.5ZM3 8.5V14l4.5 2.5M12 8.5V14l-4.5 2.5" />
    <path d="M12 8.5 16.5 6 21 8.5 16.5 11 12 8.5ZM21 8.5V14l-4.5 2.5V11" />
  </svg>
);

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 6M17 19c0-1.6-.6-3-1.6-4" />
  </svg>
);

export const IconGear = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </svg>
);

export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
  </svg>
);

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconPanelLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);
