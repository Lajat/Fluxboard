"use client";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useActiveWorkspace } from "@/context/ActiveWorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { getSocket } from "@/lib/socket";
import { EditableTitle } from "@/components/ui/EditableTitle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FolderIcon, LogOutIcon, PlusIcon, TrashIcon, SpinnerIcon } from "@/components/ui/icons";
import type { Workspace } from "@fluxboard/shared-types";
import { SocketEvents, type WorkspaceMembershipPayload, type AccessRevokedPayload } from "@fluxboard/shared-types";

export default function WorkspacesPage() {
  const { user, accessToken, isLoading: authLoading, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const { setActiveWorkspaceId } = useActiveWorkspace();

  // This page isn't "inside" any particular workspace — clear the
  // sidebar's highlighted/auto-expanded one so it doesn't keep showing a
  // stale selection from wherever the user was before.
  useEffect(() => {
    setActiveWorkspaceId(null);
  }, [setActiveWorkspaceId]);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState<Workspace | null>(null);
  const deletedWorkspaceIds = useRef(new Set<string>());

  // A create reaches this tab through both the socket event and the HTTP
  // response. Upserting by id makes either arrival order safe and prevents
  // duplicate workspace cards.
  const upsertWorkspace = useCallback((workspace: Workspace) => {
    deletedWorkspaceIds.current.delete(workspace.id);
    setWorkspaces((prev) => (prev.some((ws) => ws.id === workspace.id) ? prev : [...prev, workspace]));
  }, []);

  // Redirect to login if not authenticated — this page requires a user.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;

    apiFetch<{ items: Workspace[] }>("/workspaces", { accessToken })
      .then((res) => {
        // Keep any membership event that arrived while this request was in
        // flight; the response is only a snapshot from before that event.
        setWorkspaces((prev) => {
          const fetched = res.items.filter((workspace) => !deletedWorkspaceIds.current.has(workspace.id));
          const fetchedIds = new Set(fetched.map((workspace) => workspace.id));
          return [...fetched, ...prev.filter((workspace) => !fetchedIds.has(workspace.id))];
        });
      })
      .catch((err) =>
        showToast(err instanceof ApiError ? err.message : "Failed to load workspaces", "error")
      )
      .finally(() => setIsLoadingWorkspaces(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // If someone adds this user to a workspace while they're sitting on this
  // exact page, the new workspace appears in the grid immediately — no
  // refresh needed. This relies on the shared socket already being in
  // this user's personal `user:<id>` room, which happens automatically at
  // connection time via the httpOnly auth cookie (see lib/socket.ts) — no
  // explicit join call needed here.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    function handleMemberAdded(payload: WorkspaceMembershipPayload & { workspace?: Workspace }) {
      if (payload.member.id !== user!.id || !payload.workspace) return;
      upsertWorkspace(payload.workspace);
      // Creating a workspace also emits MEMBER_ADDED to its creator (that's
      // how the sidebar learns about it). "You were added to <your own new
      // workspace>" would be a nonsense toast, so only announce workspaces
      // somebody ELSE owns.
      if (payload.workspace.ownerId !== user!.id) {
        showToast(`You were added to "${payload.workspace.name}"`);
      }
    }

    // The counterpart to the above: if someone is removed from a
    // workspace WHILE already sitting on this exact grid, AuthContext's
    // global listener will try to redirect them to /workspaces — but
    // they're already here, so that redirect alone does nothing and the
    // now-inaccessible workspace would otherwise just sit in the grid,
    // stale, until a manual refresh. This removes it from view directly.
    function handleAccessRevoked(payload: AccessRevokedPayload) {
      deletedWorkspaceIds.current.add(payload.workspaceId);
      setWorkspaces((prev) => prev.filter((ws) => ws.id !== payload.workspaceId));
    }

    socket.on(SocketEvents.MEMBER_ADDED, handleMemberAdded);
    socket.on(SocketEvents.ACCESS_REVOKED, handleAccessRevoked);
    return () => {
      socket.off(SocketEvents.MEMBER_ADDED, handleMemberAdded);
      socket.off(SocketEvents.ACCESS_REVOKED, handleAccessRevoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function handleCreateWorkspace(e: FormEvent) {
    e.preventDefault();
    if (!newWorkspaceName.trim()) {
      setCreateError("Workspace name is required.");
      return;
    }

    try {
      const created = await apiFetch<Workspace>("/workspaces", {
        method: "POST",
        accessToken,
        body: { name: newWorkspaceName },
      });
      upsertWorkspace(created);
      setNewWorkspaceName("");
      setIsCreating(false);
      setCreateError(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to create workspace", "error");
    }
  }

  async function handleRenameWorkspace(workspaceId: string, name: string) {
    try {
      const updated = await apiFetch<Workspace>(`/workspaces/${workspaceId}`, {
        method: "PATCH",
        accessToken,
        body: { name },
      });
      setWorkspaces((prev) => prev.map((ws) => (ws.id === workspaceId ? updated : ws)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to rename workspace", "error");
    }
  }

  async function handleDeleteWorkspace() {
    if (!deletingWorkspace) return;
    try {
      await apiFetch(`/workspaces/${deletingWorkspace.id}`, { method: "DELETE", accessToken });
      deletedWorkspaceIds.current.add(deletingWorkspace.id);
      setWorkspaces((prev) => prev.filter((ws) => ws.id !== deletingWorkspace.id));
      showToast("Workspace deleted");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to delete workspace", "error");
    } finally {
      setDeletingWorkspace(null);
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <SpinnerIcon className="h-6 w-6 text-brand-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <FolderIcon className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Your workspaces</h1>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
          >
            <LogOutIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>

        <p className="mb-6 text-sm text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{user.displayName}</span>
        </p>

        {isLoadingWorkspaces ? (
          <div className="flex justify-center py-16">
            <SpinnerIcon className="h-6 w-6 text-brand-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md"
              >
                <Link href={`/workspaces/${ws.id}`} className="block">
                  <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <FolderIcon className="h-4 w-4" />
                  </div>
                  <div className="mt-2 pr-8">
                    <EditableTitle
                      as="h2"
                      value={ws.name}
                      onSave={(next) => handleRenameWorkspace(ws.id, next)}
                      className="font-semibold text-slate-900"
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {ws.memberIds.length} member{ws.memberIds.length === 1 ? "" : "s"}
                  </p>
                </Link>
                <button
                  onClick={() => setDeletingWorkspace(ws)}
                  aria-label={`Delete ${ws.name}`}
                  className="absolute right-3 top-3 rounded-md p-1.5 text-slate-300 opacity-100 hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}

            {isCreating ? (
              <form
                onSubmit={handleCreateWorkspace}
                className="flex flex-col justify-center rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 p-4"
              >
                <input
                  autoFocus
                  type="text"
                  placeholder="Workspace name"
                  value={newWorkspaceName}
                  onChange={(e) => {
                    setNewWorkspaceName(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  onKeyDown={(e) => e.key === "Escape" && setIsCreating(false)}
                  aria-invalid={!!createError}
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-2 ${
                    createError
                      ? "border-red-300 ring-red-100"
                      : "border-brand-300 ring-brand-100"
                  }`}
                />
                {createError && <p className="mt-1 text-xs text-red-600">{createError}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setCreateError(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="flex min-h-[104px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400 hover:border-brand-300 hover:bg-white hover:text-brand-600"
              >
                <PlusIcon className="h-5 w-5" />
                New workspace
              </button>
            )}
          </div>
        )}

        {!isLoadingWorkspaces && workspaces.length === 0 && !isCreating && (
          <p className="mt-4 text-center text-sm text-slate-400">
            No workspaces yet — create one above to get started.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={!!deletingWorkspace}
        title="Delete this workspace?"
        description={`"${deletingWorkspace?.name}" and every board, list, and card inside it will be permanently deleted for all members.`}
        onCancel={() => setDeletingWorkspace(null)}
        onConfirm={handleDeleteWorkspace}
      />
    </main>
  );
}
