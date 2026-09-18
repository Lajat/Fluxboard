import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "fluxboard",
  description: "A real-time collaborative Kanban board",
};

// Locks pinch-zoom off but keeps accessibility zoom available via the OS,
// and disables the mobile "pull to refresh" overscroll bounce that would
// otherwise interfere with dragging a card near the top of the screen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

/**
 * Root layout wrapping every page in the app. AuthProvider makes the
 * logged-in user (and login/signup/logout functions) available to any
 * page via the useAuth() hook, and ToastProvider makes lightweight
 * success/error notifications available via useToast() — both without
 * prop-drilling.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="overscroll-none bg-slate-50 text-slate-900">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
