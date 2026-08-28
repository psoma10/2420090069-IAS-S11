import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";
import { FlowProvider } from "./context/FlowContext";
import "./styles/base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FlowProvider>
          <App />
        </FlowProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
