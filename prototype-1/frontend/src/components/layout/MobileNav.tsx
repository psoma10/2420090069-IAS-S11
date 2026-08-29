import { useCallback, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./navItems";
import { useFocusTrap } from "./useFocusTrap";
import styles from "./MobileNav.module.css";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  /** Id of the header trigger, so the dialog can be labelled/associated. */
  triggerId: string;
}

/**
 * Off-canvas primary navigation for viewports below 1024px, where the desktop
 * sidebar is hidden. Rendered as a modal dialog: backdrop click, Escape and
 * selecting a link all close it; focus is trapped while open and returned to
 * the hamburger trigger on close.
 *
 * Kept mounted (rather than conditionally rendered) so the panel can animate
 * out; `inert`/aria-hidden keep it out of the a11y tree and tab order when shut.
 */
export function MobileNav({ open, onClose, triggerId }: MobileNavProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, open, { onEscape: handleEscape });

  // `inert` isn't in React 19's DOM typings for all versions — set it imperatively.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    if (open) {
      node.removeAttribute("inert");
    } else {
      node.setAttribute("inert", "");
    }
  }, [open]);

  return (
    <div className={[styles.root, open ? styles.rootOpen : ""].filter(Boolean).join(" ")}>
      <div
        className={styles.backdrop}
        onClick={onClose}
        aria-hidden="true"
        data-testid="mobile-nav-backdrop"
      />
      <div
        ref={panelRef}
        id="primary-nav-drawer"
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={triggerId}
        data-testid="mobile-nav-panel"
      >
        <div className={styles.panelHeader}>
          <span className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            CyberVault
          </span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            <span className="sr-only">Close navigation</span>
          </button>
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) => [styles.navLink, isActive ? styles.navLinkActive : ""].filter(Boolean).join(" ")}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
