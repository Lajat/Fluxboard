"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

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
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-gray-400">Loading...</p>
    </main>
  );
}
