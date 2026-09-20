"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useActiveWorkspace } from "@/context/ActiveWorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { getSocket } from "@/lib/socket";
import { EditableTitle } from "@/components/ui/EditableTitle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AvatarStack } from "@/components/ui/AvatarStack";
import { MembersModal } from "@/components/MembersModal";
import { ChevronLeftIcon, LayoutIcon, PlusIcon, TrashIcon, SpinnerIcon } from "@/components/ui/icons";
import type { Board, Workspace, WorkspaceMember, MemberPermissions } from "@fluxboard/shared-types";
import {
  SocketEvents,
  type WorkspaceMembershipPayload,
  type MemberPermissionsUpdatedPayload,
} from "@fluxboard/shared-types";

// A small rotating set of gradients for board tile headers — purely
// cosmetic, but it makes a grid of same-shaped tiles easy to tell apart
// at a glance, the same way physical Trello-style boards use cover colors.
const BOARD_GRADIENTS = [
  "from-brand-500 to-indigo-600",
  "from-teal-500 to-emerald-600",
  "from-orange-400 to-pink-500",
  "from-sky-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
];

/**
 * The board grid for a single workspace — create/rename/delete boards,
 * plus the member-management panel (invites, permissions, removal).
 * Joins this workspace's socket room on mount (see the effect below) so
 * BOARD_CREATED/BOARD_DELETED and membership changes reach this page live
 * while it's open.
 */
export default function WorkspaceBoardsPage() {
  const { accessToken, isLoading: authLoading, user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const { setActiveWorkspaceId } = useActiveWorkspace();

  // Tell the sidebar which workspace this page is "inside" so it
  // auto-expands and highlights the right one — see ActiveWorkspaceContext.
  useEffect(() => {
    setActiveWorkspaceId(workspaceId);
  }, [workspaceId, setActiveWorkspaceId]);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoadingBoards, setIsLoadingBoards] = useState(true);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingBoard, setDeletingBoard] = useState<Board | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isLoadingInviteLink, setIsLoadingInviteLink] = useState(false);
  // Computed early (rather than after the loading-state early return below)
  // because it's needed inside a useEffect further down, and hooks can't
  // follow a conditional return.
  const isOwner = workspace?.ownerId === user?.id;
  // Same reasoning as the board page's myPermissions — see the comment
  // there for why this defaults to full access while `members` is still
  // loading rather than flashing every button as disabled.
  const myPermissions = user
    ? members.find((m) => m.id === user.id)?.permissions ?? { canAdd: true, canEdit: true, canDelete: true }
    : { canAdd: false, canEdit: false, canDelete: false };

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;

    Promise.all([
      apiFetch<Workspace>(`/workspaces/${workspaceId}`, { accessToken }),
      apiFetch<{ items: Board[] }>(`/workspaces/${workspaceId}/boards`, { accessToken }),
      apiFetch<{ items: WorkspaceMember[] }>(`/workspaces/${workspaceId}/members`, { accessToken }),
    ])
      .then(([ws, boardsRes, membersRes]) => {
        setWorkspace(ws);
        setBoards(boardsRes.items);
        setMembers(membersRes.items);
      })
      .catch((err) =>
        showToast(err instanceof ApiError ? err.message : "Failed to load workspace", "error")
      )
      .finally(() => setIsLoadingBoards(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, workspaceId]);

  // Real-time sync for everything at the workspace level: boards being
  // created/renamed/deleted by someone else, members joining/leaving, and
  // the workspace itself being renamed or deleted out from under this
  // page. This is the piece that makes "multiple people looking at the
  // same workspace" actually behave like it — without it, every one of
  // these changes would only show up on this page's next manual refresh.
  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket();
    socket.emit("join-workspace", workspaceId);
    function rejoinOnReconnect() {
      socket.emit("join-workspace", workspaceId);
    }
    socket.on("connect", rejoinOnReconnect);

    function handleBoardCreated(board: Board) {
      if (board.workspaceId !== workspaceId) return;
      // Guards against double-adding in the tab that created it — see the
      // identical pattern (and full explanation) in the board page for
      // cards/lists: the socket event and this tab's own HTTP response
      // can arrive in either order.
      setBoards((prev) => (prev.some((b) => b.id === board.id) ? prev : [...prev, board]));
    }

    function handleBoardUpdated(board: Board) {
      if (board.workspaceId !== workspaceId) return;
      setBoards((prev) => prev.map((b) => (b.id === board.id ? board : b)));
    }

    function handleBoardDeleted(board: Board) {
      if (board.workspaceId !== workspaceId) return;
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
    }

    function handleWorkspaceUpdated(updated: Workspace) {
      if (updated.id !== workspaceId) return;
      setWorkspace(updated);
    }

    function handleWorkspaceDeleted(deleted: Workspace) {
      if (deleted.id !== workspaceId) return;
      showToast(`"${deleted.name}" was deleted`, "error");
      router.replace("/workspaces");
    }

    function handleMemberAdded({ workspaceId: wsId, member }: WorkspaceMembershipPayload) {
      if (wsId !== workspaceId) return;
      setMembers((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
      if (member.id !== user?.id) showToast(`${member.displayName} joined the workspace`);
    }

    function handleMemberRemoved({ workspaceId: wsId, userId }: { workspaceId: string; userId: string }) {
      if (wsId !== workspaceId) return;
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    }

    function handleMemberPermissionsUpdated({ workspaceId: wsId, member }: MemberPermissionsUpdatedPayload) {
      if (wsId !== workspaceId) return;
      setMembers((prev) => prev.map((m) => (m.id === member.id ? member : m)));
    }

    socket.on(SocketEvents.BOARD_CREATED, handleBoardCreated);
    socket.on(SocketEvents.BOARD_UPDATED, handleBoardUpdated);
    socket.on(SocketEvents.BOARD_DELETED, handleBoardDeleted);
    socket.on(SocketEvents.WORKSPACE_UPDATED, handleWorkspaceUpdated);
    socket.on(SocketEvents.WORKSPACE_DELETED, handleWorkspaceDeleted);
    socket.on(SocketEvents.MEMBER_ADDED, handleMemberAdded);
    socket.on(SocketEvents.MEMBER_REMOVED, handleMemberRemoved);
    socket.on(SocketEvents.MEMBER_PERMISSIONS_UPDATED, handleMemberPermissionsUpdated);

    return () => {
      socket.emit("leave-workspace", workspaceId);
      socket.off("connect", rejoinOnReconnect);
      socket.off(SocketEvents.BOARD_CREATED, handleBoardCreated);
      socket.off(SocketEvents.BOARD_UPDATED, handleBoardUpdated);
      socket.off(SocketEvents.BOARD_DELETED, handleBoardDeleted);
      socket.off(SocketEvents.WORKSPACE_UPDATED, handleWorkspaceUpdated);
      socket.off(SocketEvents.WORKSPACE_DELETED, handleWorkspaceDeleted);
      socket.off(SocketEvents.MEMBER_ADDED, handleMemberAdded);
      socket.off(SocketEvents.MEMBER_REMOVED, handleMemberRemoved);
      socket.off(SocketEvents.MEMBER_PERMISSIONS_UPDATED, handleMemberPermissionsUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, user?.id, accessToken]);

  async function handleCreateBoard(e: FormEvent) {
    e.preventDefault();
    if (!newBoardTitle.trim()) {
      setCreateError("Board title is required.");
      return;
    }

    try {
      const created = await apiFetch<Board>(`/workspaces/${workspaceId}/boards`, {
        method: "POST",
        accessToken,
        body: { title: newBoardTitle },
      });
      setBoards((prev) => (prev.some((b) => b.id === created.id) ? prev : [...prev, created]));
      setNewBoardTitle("");
      setIsCreating(false);
      setCreateError(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to create board", "error");
    }
  }

  async function handleRenameBoard(boardId: string, title: string) {
    try {
      const updated = await apiFetch<Board>(`/boards/${boardId}`, {
        method: "PATCH",
        accessToken,
        body: { title },
      });
      setBoards((prev) => prev.map((b) => (b.id === boardId ? updated : b)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to rename board", "error");
    }
  }

  async function handleDeleteBoard() {
    if (!deletingBoard) return;
    try {
      await apiFetch(`/boards/${deletingBoard.id}`, { method: "DELETE", accessToken });
      setBoards((prev) => prev.filter((b) => b.id !== deletingBoard.id));
      showToast("Board deleted");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to delete board", "error");
    } finally {
      setDeletingBoard(null);
    }
  }

  async function handleInviteMember(email: string) {
    const res = await apiFetch<{ workspace: Workspace; member: WorkspaceMember }>(
      `/workspaces/${workspaceId}/members`,
      { method: "POST", accessToken, body: { email } }
    );
    setMembers((prev) => (prev.some((m) => m.id === res.member.id) ? prev : [...prev, res.member]));
    showToast(`${res.member.displayName} was added to the workspace`);
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    try {
      await apiFetch(`/workspaces/${workspaceId}/members/${member.id}`, {
        method: "DELETE",
        accessToken,
      });
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      showToast(`${member.displayName} was removed from the workspace`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to remove member", "error");
    }
  }

  async function handleUpdateMemberPermissions(member: WorkspaceMember, updates: Partial<MemberPermissions>) {
    try {
      const res = await apiFetch<{ member: WorkspaceMember }>(
        `/workspaces/${workspaceId}/members/${member.id}/permissions`,
        { method: "PATCH", accessToken, body: updates }
      );
      setMembers((prev) => prev.map((m) => (m.id === res.member.id ? res.member : m)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update permissions", "error");
    }
  }

  // Lazily fetch the invite link only once the owner actually opens the
  // members modal (not on page load) — it's a secondary action most
  // visits to this page never need, so there's no reason to spend a
  // request on it up front.
  useEffect(() => {
    if (!isMembersModalOpen || !isOwner || inviteToken || !accessToken) return;
    setIsLoadingInviteLink(true);
    apiFetch<{ token: string }>(`/workspaces/${workspaceId}/invite-link`, { accessToken })
      .then((res) => setInviteToken(res.token))
      .catch((err) => showToast(err instanceof ApiError ? err.message : "Failed to load invite link", "error"))
      .finally(() => setIsLoadingInviteLink(false));
  }, [isMembersModalOpen, isOwner, inviteToken, accessToken, workspaceId, showToast]);

  async function handleRegenerateInviteLink() {
    try {
      const res = await apiFetch<{ token: string }>(`/workspaces/${workspaceId}/invite-link/regenerate`, {
        method: "POST",
        accessToken,
      });
      setInviteToken(res.token);
      showToast("Invite link regenerated");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to regenerate invite link", "error");
    }
  }

  if (authLoading || isLoadingBoards) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <SpinnerIcon className="h-6 w-6 text-brand-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/workspaces"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
        >
          <ChevronLeftIcon className="h-4 w-4" /> All workspaces
        </Link>

        <div className="mb-8 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {workspace?.name ?? "Workspace"}
          </h1>
          <AvatarStack members={members} onClick={() => setIsMembersModalOpen(true)} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {boards.map((board, i) => (
            <div key={board.id} className="group relative">
              <Link
                href={`/boards/${board.id}`}
                className={`flex h-28 flex-col justify-between rounded-xl bg-gradient-to-br p-3 text-white shadow-sm transition hover:shadow-lg ${
                  BOARD_GRADIENTS[i % BOARD_GRADIENTS.length]
                }`}
              >
                <LayoutIcon className="h-5 w-5 opacity-80" />
                {/* EditableTitle intercepts its own click (preventDefault +
                    stopPropagation) so clicking the text to rename it
                    doesn't also trigger this Link's navigation — clicking
                    anywhere else on the tile still navigates normally. */}
                <EditableTitle
                  value={board.title}
                  onSave={(next) => handleRenameBoard(board.id, next)}
                  disabled={!myPermissions.canEdit}
                  className="line-clamp-2 text-sm font-semibold text-white hover:bg-white/15"
                  inputClassName="w-full rounded-md border border-white/40 bg-white/20 px-1.5 py-0.5 text-sm font-semibold text-white placeholder-white/70 outline-none ring-2 ring-white/30"
                />
              </Link>
              {myPermissions.canDelete && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setDeletingBoard(board);
                  }}
                  aria-label={`Delete ${board.title}`}
                  className="absolute right-2 top-2 rounded-md bg-black/20 p-1.5 text-white opacity-100 backdrop-blur-sm transition hover:bg-black/40 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {!myPermissions.canAdd ? null : isCreating ? (
            <form
              onSubmit={handleCreateBoard}
              className="col-span-2 flex h-28 flex-col justify-center rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 p-3 sm:col-span-1"
            >
              <input
                autoFocus
                type="text"
                placeholder="Board title"
                value={newBoardTitle}
                onChange={(e) => {
                  setNewBoardTitle(e.target.value);
                  if (createError) setCreateError(null);
                }}
                onKeyDown={(e) => e.key === "Escape" && setIsCreating(false)}
                aria-invalid={!!createError}
                className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm outline-none ring-2 ${
                  createError ? "border-red-300 ring-red-100" : "border-brand-300 ring-brand-100"
                }`}
              />
              {createError && <p className="mt-1 text-[11px] text-red-600">{createError}</p>}
              <div className="mt-2 flex gap-1.5">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setCreateError(null);
                  }}
                  className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400 hover:border-brand-300 hover:bg-white hover:text-brand-600"
            >
              <PlusIcon className="h-5 w-5" />
              New board
            </button>
          )}
        </div>

        {boards.length === 0 && !isCreating && (
          <p className="mt-4 text-center text-sm text-slate-400">No boards yet — create one above.</p>
        )}
      </div>

      <ConfirmDialog
        open={!!deletingBoard}
        title="Delete this board?"
        description={`"${deletingBoard?.title}" and every list and card on it will be permanently deleted.`}
        onCancel={() => setDeletingBoard(null)}
        onConfirm={handleDeleteBoard}
      />

      {user && (
        <MembersModal
          open={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          workspaceName={workspace?.name ?? "Workspace"}
          members={members}
          isOwner={isOwner}
          currentUserId={user.id}
          onInvite={handleInviteMember}
          onRemove={handleRemoveMember}
          onUpdatePermissions={handleUpdateMemberPermissions}
          inviteLink={
            inviteToken && typeof window !== "undefined"
              ? `${window.location.origin}/invite/${inviteToken}`
              : null
          }
          isLoadingInviteLink={isLoadingInviteLink}
          onRegenerateInviteLink={handleRegenerateInviteLink}
        />
      )}
    </main>
  );
}
