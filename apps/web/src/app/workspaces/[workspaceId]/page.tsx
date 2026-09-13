"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, ApiError } from "@/lib/apiClient";
import type { Board, Workspace } from "@fluxboard/shared-types";

export default function WorkspaceBoardsPage() {
  const { accessToken, isLoading: authLoading, user } = useAuth();
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoadingBoards, setIsLoadingBoards] = useState(true);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load boards"))
      .finally(() => setIsLoadingBoards(false));
  }, [accessToken, workspaceId]);

  async function handleCreateBoard(e: FormEvent) {
    e.preventDefault();
    if (!newBoardTitle.trim()) return;

    try {
      const created = await apiFetch<Board>(`/workspaces/${workspaceId}/boards`, {
        method: "POST",
        accessToken,
        body: { title: newBoardTitle },
      });
      setBoards((prev) => [...prev, created]);
      setNewBoardTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create board");
    }
  }

  if (authLoading || isLoadingBoards) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/workspaces" className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-800">
          ← All workspaces
        </Link>

        <h1 className="mb-8 text-2xl font-bold text-gray-900">
          {workspace?.name ?? "Workspace"}
        </h1>

        <form onSubmit={handleCreateBoard} className="mb-8 flex gap-2">
          <input
            type="text"
            placeholder="New board title"
            value={newBoardTitle}
            onChange={(e) => setNewBoardTitle(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
          >
            Create board
          </button>
        </form>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {boards.length === 0 ? (
          <p className="text-gray-400">No boards yet — create one above.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {boards.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/boards/${board.id}`}
                  className="block rounded-md border border-gray-200 bg-white px-4 py-6 text-center font-medium hover:border-gray-300 hover:shadow-sm"
                >
                  {board.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
