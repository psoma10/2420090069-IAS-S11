import type { SVGProps } from "react";

/**
 * Minimal inline icon set for feedback components.
 *
 * Deliberately not emoji: the PRD calls for a professional security product,
 * and emoji render inconsistently across platforms and are announced verbosely
 * by screen readers. Every icon here is decorative (aria-hidden) and paired
 * with a visible text label, so colour is never the only signal.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...rest,
  };
}

/** Filled-outline triangle — errors and destructive failures. */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** Circle-slash — blocked or unavailable states. */
export function AlertCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

/** Check in a circle — success confirmations. */
export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21.8 11.1V12a9 9 0 1 1-5.34-8.23" />
      <path d="m9 11 3 3 8-8" />
    </svg>
  );
}

/** Lowercase i in a circle — neutral informational notices. */
export function InfoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/** Circular arrow — retry affordance. */
export function RetryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/** X — dismiss controls. */
export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** Struck-through cloud/plug — server unreachable. */
export function ServerOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <path d="M6 6.5h.01" />
      <path d="M6 17.5h.01" />
      <path d="m2 22 20-20" />
    </svg>
  );
}

/** Outlined document — empty document lists. */
export function DocumentIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

/** Padlock — encryption/vault empty states. */
export function VaultIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="10" width="18" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2" />
    </svg>
  );
}

/** Arrows crossing — empty transfer history. */
export function TransferIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 8h14" />
      <path d="m14 5 3 3-3 3" />
      <path d="M21 16H7" />
      <path d="m10 13-3 3 3 3" />
    </svg>
  );
}

/** Pulse line — empty activity log. */
export function ActivityIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

/** Magnifier — no search/filter results. */
export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
