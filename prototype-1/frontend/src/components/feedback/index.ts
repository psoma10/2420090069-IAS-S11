/**
 * Shared feedback surface for CyberVault: errors, toasts, and offline
 * detection. (Empty/loading states live per-domain — see
 * components/data/EmptyState and components/server/PageState — since each
 * screen's empty copy and skeleton shape differ enough that one shared
 * component wasn't earning its abstraction.)
 *
 * Import from this barrel so pages have one import line rather than several:
 *   import { ErrorBanner, useToast } from "../components/feedback";
 *
 * Providers are mounted once in src/main.tsx (ToastProvider,
 * ConnectivityProvider) and OfflineBanner is mounted in AppShell — pages only
 * need the hooks and the presentational components.
 */

export { ErrorBanner, type BannerTone } from "./ErrorBanner";
export { ToastProvider } from "./ToastProvider";
export { useToast, type Toast, type ToastOptions, type ToastTone } from "./toastContext";
export { ConnectivityProvider } from "./ConnectivityProvider";
export { useConnectivity, type ConnectivityStatus } from "./connectivityContext";
export { OfflineBanner } from "./OfflineBanner";
export {
  ActivityIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  DocumentIcon,
  InfoIcon,
  RetryIcon,
  SearchIcon,
  ServerOffIcon,
  TransferIcon,
  VaultIcon,
} from "./icons";
