"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { SpinnerIcon } from "@/components/ui/icons";
import { getPostAuthRedirect } from "@/lib/authRedirect";

export function AuthPageRedirect({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getPostAuthRedirect(window.location.search));
    }
  }, [isLoading, router, user]);

  if (isLoading || user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <SpinnerIcon className="h-6 w-6 text-brand-500" />
      </main>
    );
  }

  return children;
}
