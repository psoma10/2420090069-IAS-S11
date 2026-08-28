import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// Dev-only bypass so pages can be built/screenshotted/tested against
// mock data before the backend auth flow is runnable end-to-end.
// VITE_DEV_BYPASS_AUTH must be unset in any real build/deploy.
const DEV_BYPASS_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

/** Route guard: redirects unauthenticated visitors to /login, preserving intended destination. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (DEV_BYPASS_AUTH) {
    return <Outlet />;
  }

  if (status === "loading") {
    return null; // AppShell mounts nothing yet; a global loader could go here.
  }

  if (status === "anonymous") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
