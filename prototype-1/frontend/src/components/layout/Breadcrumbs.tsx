import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { findActiveNavItem } from "./navItems";
import styles from "./Breadcrumbs.module.css";

interface Crumb {
  label: string;
  to?: string;
}

/** Truncates opaque ids (uuid/hash/numeric) so a crumb never blows out the header. */
function labelForSegment(segment: string): string {
  const decoded = decodeURIComponent(segment);
  const looksLikeId = /^[0-9a-f-]{8,}$/i.test(decoded) || /^\d+$/.test(decoded);
  if (looksLikeId) {
    return decoded.length > 10 ? `${decoded.slice(0, 8)}…` : decoded;
  }
  return decoded.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildCrumbs(pathname: string): Crumb[] {
  const section = findActiveNavItem(pathname);
  if (!section) return [];

  // Only nested routes need a trail — top-level pages already show their
  // name as the header title, so a one-item breadcrumb would be noise.
  const rest = pathname.slice(section.to.length).split("/").filter(Boolean);
  if (rest.length === 0) return [];

  const crumbs: Crumb[] = [{ label: section.label, to: section.to }];
  let acc = section.to;
  rest.forEach((segment, index) => {
    acc += `/${segment}`;
    crumbs.push({
      label: labelForSegment(segment),
      to: index === rest.length - 1 ? undefined : acc,
    });
  });
  return crumbs;
}

/**
 * Header breadcrumb trail for nested routes (/documents/:id, /transfers/:id,
 * /upload/preview). Renders nothing on top-level sections.
 */
export function Breadcrumbs() {
  const { pathname } = useLocation();
  const crumbs = buildCrumbs(pathname);

  if (crumbs.length === 0) return null;

  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      <ol className={styles.list}>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li className={styles.item}>
                {crumb.to && !isLast ? (
                  <Link to={crumb.to} className={styles.link}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={styles.current} aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li className={styles.separator} aria-hidden="true">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
