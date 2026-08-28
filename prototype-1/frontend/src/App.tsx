import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAuth } from "./components/layout/RequireAuth";
import { FlowOutlet } from "./components/flow/FlowOutlet";
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
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

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
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
