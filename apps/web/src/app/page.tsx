"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { SpinnerIcon } from "@/components/ui/icons";

/**
 * The home page has no content of its own — it just routes the visitor
 * to the right place based on whether they're logged in. Waits for
 * isLoading to resolve first, so a logged-in user on refresh doesn't
 * flash through /login before landing on /workspaces.
 */
export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/workspaces" : "/login");
  }, [user, isLoading, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50">
      <SpinnerIcon className="h-6 w-6 text-brand-500" />
    </main>
  );
}
