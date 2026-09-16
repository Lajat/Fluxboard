"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { LayoutIcon, SpinnerIcon, CheckIcon } from "@/components/ui/icons";
import type { Workspace, WorkspaceMember } from "@fluxboard/shared-types";

type JoinState = "idle" | "joining" | "joined" | "error";

/**
 * Landing page for a shareable workspace invite link
 * (fluxboard.app/invite/<token>). This is the "send a team invite via
 * email" experience, implemented without actually sending email: anyone
 * holding the link can land here and join with one click, the same way
 * Slack/Notion/Discord invite links work.
 *
 * There's deliberately no server-side "preview" of the workspace before
 * joining — the Join button itself makes the request, and only on success
 * do we know (and show) the workspace's real name. This keeps the feature
 * to one endpoint (POST /invites/:token/join) instead of also needing a
 * separate "peek at this token" endpoint.
 */
export default function InvitePage() {
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joinedWorkspace, setJoinedWorkspace] = useState<Workspace | null>(null);

  async function handleJoin() {
    setJoinState("joining");
    setErrorMessage(null);
    try {
      const res = await apiFetch<{ workspace: Workspace; member: WorkspaceMember; alreadyMember: boolean }>(
        `/invites/${token}/join`,
        { method: "POST", accessToken }
      );
      setJoinedWorkspace(res.workspace);
      setJoinState("joined");
      setTimeout(() => router.push(`/workspaces/${res.workspace.id}`), 1200);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setJoinState("error");
    }
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50">
        <SpinnerIcon className="h-6 w-6 text-brand-500" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
            <LayoutIcon className="h-6 w-6" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-400">Fluxboard</span>
        </div>

        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
          {joinState === "joined" ? (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckIcon className="h-6 w-6" />
              </div>
              <h1 className="text-lg font-bold text-slate-900">
                You&apos;re in{joinedWorkspace ? `: ${joinedWorkspace.name}` : ""}!
              </h1>
              <p className="mt-1 text-sm text-slate-500">Taking you there now...</p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold text-slate-900">You&apos;ve been invited</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Join this team&apos;s workspace on fluxboard to start collaborating on boards together.
              </p>

              {errorMessage && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
              )}

              {user ? (
                <button
                  onClick={handleJoin}
                  disabled={joinState === "joining"}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {joinState === "joining" && <SpinnerIcon className="h-4 w-4" />}
                  {joinState === "joining" ? "Joining..." : "Join workspace"}
                </button>
              ) : (
                <div className="mt-5 space-y-2">
                  <Link
                    href={`/signup?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                    className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
                  >
                    Create an account to join
                  </Link>
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                    className="flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    I already have an account
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
