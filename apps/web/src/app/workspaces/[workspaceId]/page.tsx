"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { EditableTitle } from "@/components/ui/EditableTitle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ChevronLeftIcon, LayoutIcon, PlusIcon, TrashIcon, SpinnerIcon } from "@/components/ui/icons";
import type { Board, Workspace } from "@fluxboard/shared-types";

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

export default function WorkspaceBoardsPage() {
  const { accessToken, isLoading: authLoading, user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoadingBoards, setIsLoadingBoards] = useState(true);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingBoard, setDeletingBoard] = useState<Board | null>(null);

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
    ])
      .then(([ws, boardsRes]) => {
        setWorkspace(ws);
        setBoards(boardsRes.items);
      })
      .catch((err) =>
        showToast(err instanceof ApiError ? err.message : "Failed to load boards", "error")
      )
      .finally(() => setIsLoadingBoards(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, workspaceId]);

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
      setBoards((prev) => [...prev, created]);
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

        <h1 className="mb-8 text-xl font-bold text-slate-900 sm:text-2xl">
          {workspace?.name ?? "Workspace"}
        </h1>

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
                  className="line-clamp-2 text-sm font-semibold text-white hover:bg-white/15"
                  inputClassName="w-full rounded-md border border-white/40 bg-white/20 px-1.5 py-0.5 text-sm font-semibold text-white placeholder-white/70 outline-none ring-2 ring-white/30"
                />
              </Link>
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
            </div>
          ))}

          {isCreating ? (
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
    </main>
  );
}
