import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";
import { FlowProvider } from "./context/FlowContext";
import { ToastProvider } from "./components/feedback/ToastProvider";
import { ConnectivityProvider } from "./components/feedback/ConnectivityProvider";
import "./styles/base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Outermost provider: Auth and Flow both raise toasts, so the toast
          API has to exist above them. */}
      <ToastProvider>
        <ConnectivityProvider>
          <AuthProvider>
            <FlowProvider>
              <App />
            </FlowProvider>
          </AuthProvider>
        </ConnectivityProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
