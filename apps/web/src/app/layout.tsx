import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "fluxboard",
  description: "A real-time collaborative Kanban board",
};

/**
 * Root layout wrapping every page in the app. AuthProvider makes the
 * logged-in user (and login/signup/logout functions) available to any
 * page via the useAuth() hook, without prop-drilling.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
