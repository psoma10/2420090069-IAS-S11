import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { OfflineBanner } from "../feedback/OfflineBanner";
import { useConnectivity } from "../feedback/connectivityContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Breadcrumbs } from "./Breadcrumbs";
import { MobileNav } from "./MobileNav";
import { NAV_ITEMS, findActiveNavItem } from "./navItems";
import styles from "./AppShell.module.css";

const MENU_TRIGGER_ID = "primary-nav-trigger";

/**
 * Primary app shell: sidebar nav + header + routed content.
 *
 * Below 1024px the persistent sidebar is hidden and navigation moves into
 * <MobileNav />, opened by the header hamburger. Page bodies live in src/pages.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { isOffline } = useConnectivity();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  const activeItem = findActiveNavItem(pathname);
  const pageTitle = activeItem?.label ?? "CyberVault";

  const closeNav = useCallback(() => setNavOpen(false), []);

  // Close the drawer whenever the route changes (link taps, back button,
  // programmatic redirects) so it never lingers over new content.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Resizing up to desktop makes the drawer redundant — drop it so focus trap
  // and scroll lock are released along with it.
  useEffect(() => {
    if (!navOpen) return;
    const query = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setNavOpen(false);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [navOpen]);

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          CyberVault
        </div>
        <nav className={styles.nav} aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => [styles.navLink, isActive ? styles.navLinkActive : ""].filter(Boolean).join(" ")}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <MobileNav open={navOpen} onClose={closeNav} triggerId={MENU_TRIGGER_ID} />

      <div className={styles.main}>
        <header className={styles.header}>
          <button
            type="button"
            id={MENU_TRIGGER_ID}
            className={styles.menuButton}
            onClick={() => setNavOpen((open) => !open)}
            aria-expanded={navOpen}
            aria-haspopup="dialog"
            aria-controls="primary-nav-drawer"
            data-testid="mobile-nav-trigger"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <span className="sr-only">{navOpen ? "Close navigation menu" : "Open navigation menu"}</span>
          </button>

          <div className={styles.headerTitle}>
            <h1 className={styles.pageTitle}>{pageTitle}</h1>
            <Breadcrumbs />
          </div>

          <div className={styles.headerActions}>
            {/* Live reachability from <ConnectivityProvider>, which probes
                /api/server/status and also listens to failures reported by
                pages. The OfflineBanner below the header shows the full
                PRD section 17 message and a RETRY action. */}
            <span className={styles.serverStatus}>
              <span className={styles.serverStatusLabel}>Server</span>
              <Badge tone={isOffline ? "danger" : "success"} dot>
                {isOffline ? "OFFLINE" : "ONLINE"}
              </Badge>
            </span>

            <span className={styles.divider} aria-hidden="true" />

            <span className={styles.userName} title={user?.name ?? undefined}>
              {user?.name}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void logout()} className={styles.logoutButton}>
              Log out
            </Button>
          </div>
        </header>

        <OfflineBanner />

        <main id="main-content" className={styles.content} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
