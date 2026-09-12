import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fluxboard",
  description: "A real-time collaborative Kanban board",
};

/**
 * Root layout wrapping every page in the app. Auth/theme providers that
 * need to be available app-wide get added here as they're built (e.g. a
 * SessionProvider once auth is implemented).
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
