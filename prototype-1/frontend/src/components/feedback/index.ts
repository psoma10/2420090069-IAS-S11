/**
 * Shared feedback surface for CyberVault: errors, empty states, loading
 * placeholders, toasts, and offline detection.
 *
 * Import from this barrel so pages have one import line rather than six:
 *   import { ErrorBanner, EmptyState, SkeletonTable, useToast } from "../components/feedback";
 *
 * Providers are mounted once in src/main.tsx (ToastProvider,
 * ConnectivityProvider) and OfflineBanner is mounted in AppShell — pages only
 * need the hooks and the presentational components.
 */

export { ErrorBanner, type BannerTone } from "./ErrorBanner";
export { EmptyState } from "./EmptyState";
export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable } from "./Skeleton";
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
