import type { ReactNode } from "react";

export interface NavItem {
  /** Route target. */
  to: string;
  /** Sidebar / drawer label, also used as the header page title. */
  label: string;
  /** Inline 16px stroke icon — decorative, always paired with a text label. */
  icon: ReactNode;
}

/*
  Icons are inlined 16px stroke glyphs rather than an icon package: the shell
  needs only a handful of them, and inlining keeps the nav free of a runtime
  dependency. All are aria-hidden — the adjacent label is the accessible name.
*/
const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/upload",
    label: "Secure Upload",
    icon: (
      <svg {...iconProps}>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
    ),
  },
  {
    to: "/documents",
    label: "Documents",
    icon: (
      <svg {...iconProps}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    to: "/shares",
    label: "Share Links",
    icon: (
      <svg {...iconProps}>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </svg>
    ),
  },
  {
    to: "/transfers",
    label: "Transfers",
    icon: (
      <svg {...iconProps}>
        <path d="M4 8h13" />
        <path d="m14 5 3 3-3 3" />
        <path d="M20 16H7" />
        <path d="m10 13-3 3 3 3" />
      </svg>
    ),
  },
  {
    to: "/algorithms",
    label: "Algorithms",
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v2" />
      </svg>
    ),
  },
  {
    to: "/server",
    label: "Server Monitor",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="7" rx="2" />
        <rect x="3" y="13" width="18" height="7" rx="2" />
        <path d="M7 7.5h.01M7 16.5h.01" />
      </svg>
    ),
  },
  {
    to: "/activity",
    label: "Activity",
    icon: (
      <svg {...iconProps}>
        <path d="M3 12h4l3 7 4-14 3 7h4" />
      </svg>
    ),
  },
];

/**
 * Longest-prefix match so nested routes (/documents/:id, /transfers/:id,
 * /upload/preview) still resolve to their parent section for the page title.
 */
export function findActiveNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
}
