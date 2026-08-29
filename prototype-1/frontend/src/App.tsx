import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAuth } from "./components/layout/RequireAuth";
import { FlowOutlet } from "./components/flow/FlowOutlet";
import { useAuth } from "./context/AuthContext";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UploadPage } from "./pages/UploadPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";
import { EncryptionPreviewPage } from "./pages/EncryptionPreviewPage";
import { TransfersPage } from "./pages/TransfersPage";
import { TransferMonitorPage } from "./pages/TransferMonitorPage";
import { AlgorithmsPage } from "./pages/AlgorithmsPage";
import { ServerMonitorPage } from "./pages/ServerMonitorPage";
import { ActivityPage } from "./pages/ActivityPage";
import { ShareLinksPage } from "./pages/ShareLinksPage";
import { SharedDocumentPage } from "./pages/SharedDocumentPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/**
 * "/" is the only route whose content depends on session state:
 * signed-out visitors get the public landing page, an existing session goes
 * straight to the dashboard. Deliberately NOT wrapped in RequireAuth — the
 * landing page has to render for anonymous visitors.
 *
 * While `status` is "loading" we render nothing. The session check is a
 * single fast /auth/me call, and a blank frame is better than showing the
 * marketing page to a logged-in user for one frame before redirecting.
 */
function RootRoute() {
  const { status } = useAuth();

  if (status === "loading") return null;
  if (status === "authenticated") return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* PUBLIC by design (API_CONTRACT §3.9). This route must stay OUTSIDE
          RequireAuth — the whole point of a share link is that a recipient
          with no account can open it. It also renders outside AppShell, so a
          visitor sees no sidebar, nav or account chrome. */}
      <Route path="/share/:token" element={<SharedDocumentPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {/* FlowOutlet renders the "continue where you left off" banner
              above every authenticated page. Purely additive — it adds no
              path segment, so all URLs below are unchanged. */}
          <Route element={<FlowOutlet />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/upload/preview" element={<EncryptionPreviewPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/transfers" element={<TransfersPage />} />
            <Route path="/transfers/:id" element={<TransferMonitorPage />} />
            <Route path="/algorithms" element={<AlgorithmsPage />} />
            <Route path="/server" element={<ServerMonitorPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/shares" element={<ShareLinksPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
