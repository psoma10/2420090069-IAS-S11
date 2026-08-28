import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./AppShell.module.css";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/upload", label: "Secure Upload" },
  { to: "/documents", label: "Documents" },
  { to: "/transfers", label: "Transfers" },
  { to: "/algorithms", label: "Algorithms" },
  { to: "/server", label: "Server Monitor" },
  { to: "/activity", label: "Activity" },
];

/**
 * Primary app shell: sidebar nav + header + routed content. UI Agent 2
 * owns navigation polish/responsiveness here; page bodies live in src/pages.
 */
export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className={styles.sidebar} aria-label="Primary navigation">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          CyberVault
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => [styles.navLink, isActive ? styles.navLinkActive : ""].join(" ")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerSpacer} />
          <div className={styles.userMenu}>
            <span className={styles.userName}>{user?.name}</span>
            <button type="button" className={styles.logoutButton} onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </header>
        <main id="main-content" className={styles.content} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
