"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, ApiError } from "@/lib/apiClient";
import type { Workspace } from "@fluxboard/shared-types";

export default function WorkspacesPage() {
  const { user, accessToken, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated — this page requires a user.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;

    apiFetch<{ items: Workspace[] }>("/workspaces", { accessToken })
      .then((res) => setWorkspaces(res.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load workspaces"))
      .finally(() => setIsLoadingWorkspaces(false));
  }, [accessToken]);

  async function handleCreateWorkspace(e: FormEvent) {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    try {
      const created = await apiFetch<Workspace>("/workspaces", {
        method: "POST",
        accessToken,
        body: { name: newWorkspaceName },
      });
      setWorkspaces((prev) => [...prev, created]);
      setNewWorkspaceName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create workspace");
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Your workspaces</h1>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800">
            Log out ({user.displayName})
          </button>
        </div>

        <form onSubmit={handleCreateWorkspace} className="mb-8 flex gap-2">
          <input
            type="text"
            placeholder="New workspace name"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
          >
            Create
          </button>
        </form>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {isLoadingWorkspaces ? (
          <p className="text-gray-400">Loading workspaces...</p>
        ) : workspaces.length === 0 ? (
          <p className="text-gray-400">No workspaces yet — create one above to get started.</p>
        ) : (
          <ul className="space-y-2">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <Link
                  href={`/workspaces/${ws.id}`}
                  className="block rounded-md border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 hover:shadow-sm"
                >
                  {ws.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
