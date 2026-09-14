"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { getSocket } from "@/lib/socket";
import { BoardColumn } from "@/components/BoardColumn";
import { TaskCard } from "@/components/TaskCard";
import type { Board, List, Card } from "@fluxboard/shared-types";
import { SocketEvents, type CardMovedPayload } from "@fluxboard/shared-types";

/**
 * Local shape for a list plus its resolved cards, in on-screen order.
 * The backend gives us List.cardOrder (an array of ids); we resolve those
 * ids against a flat `cardsById` map so components can render actual card
 * objects without threading the whole map through every prop.
 */
interface ListWithCards extends Omit<List, "cardOrder"> {
  cardOrder: string[];
}

export default function BoardPage() {
  const { accessToken, isLoading: authLoading, user } = useAuth();
  const router = useRouter();
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;

  const [board, setBoard] = useState<Board | null>(null);
  const [lists, setLists] = useState<ListWithCards[]>([]);
  const [cardsById, setCardsById] = useState<Record<string, Card>>({});
  const [newListTitle, setNewListTitle] = useState("");
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Require a small drag distance before a drag "starts" — without this,
  // dnd-kit can hijack normal clicks (e.g. the delete button) as tiny drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, boardId]);

  // Real-time sync: join this board's room and apply events from OTHER
  // clients (and, harmlessly, our own — every handler below is written to
  // be idempotent, so re-applying an event we already reflected locally
  // via optimistic UI just re-does the same no-op change).
  useEffect(() => {
    const socket = getSocket();
    socket.emit("join-board", boardId);

    function upsertCard(card: Card) {
      setCardsById((prev) => ({ ...prev, [card.id]: card }));
      setLists((prev) =>
        prev.map((list) =>
          list.id === card.listId && !list.cardOrder.includes(card.id)
            ? { ...list, cardOrder: [...list.cardOrder, card.id] }
            : list
        )
      );
    }

    function handleCardDeleted({ cardId }: { cardId: string; listId: string }) {
      setCardsById((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setLists((prev) =>
        prev.map((list) => ({ ...list, cardOrder: list.cardOrder.filter((id) => id !== cardId) }))
      );
    }

    function handleCardMoved({ cardId, toListId, newIndex }: CardMovedPayload) {
      setLists((prev) => {
        const next = prev.map((l) => ({ ...l, cardOrder: l.cardOrder.filter((id) => id !== cardId) }));
        const dest = next.find((l) => l.id === toListId);
        if (dest) dest.cardOrder.splice(newIndex, 0, cardId);
        return next;
      });
      setCardsById((prev) =>
        prev[cardId] ? { ...prev, [cardId]: { ...prev[cardId], listId: toListId } } : prev
      );
    }

    function handleListCreated(list: List) {
      setLists((prev) =>
        prev.some((l) => l.id === list.id) ? prev : [...prev, { ...list, cardOrder: list.cardOrder }]
      );
    }

    function handleListDeleted({ listId }: { listId: string; boardId: string }) {
      setLists((prev) => prev.filter((l) => l.id !== listId));
    }

    function handleListReordered({ listOrder }: { boardId: string; listOrder: string[] }) {
      setLists((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]));
        return listOrder.map((id) => byId.get(id)).filter((l): l is ListWithCards => !!l);
      });
    }

    socket.on(SocketEvents.CARD_CREATED, upsertCard);
    socket.on(SocketEvents.CARD_DELETED, handleCardDeleted);
    socket.on(SocketEvents.CARD_MOVED, handleCardMoved);
    socket.on(SocketEvents.LIST_CREATED, handleListCreated);
    socket.on(SocketEvents.LIST_DELETED, handleListDeleted);
    socket.on(SocketEvents.LIST_REORDERED, handleListReordered);

    return () => {
      socket.emit("leave-board", boardId);
      socket.off(SocketEvents.CARD_CREATED, upsertCard);
      socket.off(SocketEvents.CARD_DELETED, handleCardDeleted);
      socket.off(SocketEvents.CARD_MOVED, handleCardMoved);
      socket.off(SocketEvents.LIST_CREATED, handleListCreated);
      socket.off(SocketEvents.LIST_DELETED, handleListDeleted);
      socket.off(SocketEvents.LIST_REORDERED, handleListReordered);
    };
  }, [boardId]);

  /** Fetches the board, its lists, and every list's cards, then flattens cards into one lookup map. */
  async function loadBoard() {
    try {
      const [boardRes, listsRes] = await Promise.all([
        apiFetch<Board>(`/boards/${boardId}`, { accessToken }),
        apiFetch<{ items: List[] }>(`/boards/${boardId}/lists`, { accessToken }),
      ]);
      setBoard(boardRes);

      const nextCardsById: Record<string, Card> = {};
      const listsWithCards: ListWithCards[] = [];

      for (const list of listsRes.items) {
        const cardsRes = await apiFetch<{ items: Card[] }>(`/lists/${list.id}/cards`, {
          accessToken,
        });
        cardsRes.items.forEach((card) => {
          nextCardsById[card.id] = card;
        });
        listsWithCards.push({ ...list, cardOrder: cardsRes.items.map((c) => c.id) });
      }

      setCardsById(nextCardsById);
      setLists(listsWithCards);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load board");
    } finally {
      setIsLoadingBoard(false);
    }
  }

  async function handleCreateList(e: FormEvent) {
    e.preventDefault();
    if (!newListTitle.trim()) return;

    try {
      const created = await apiFetch<List>(`/boards/${boardId}/lists`, {
        method: "POST",
        accessToken,
        body: { title: newListTitle },
      });
      // Same guard as handleAddCard above — LIST_CREATED can arrive over
      // the socket before this HTTP response resolves.
      setLists((prev) => (prev.some((l) => l.id === created.id) ? prev : [...prev, { ...created, cardOrder: [] }]));
      setNewListTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create list");
    }
  }

  async function handleAddCard(listId: string, title: string) {
    try {
      const created = await apiFetch<Card>(`/lists/${listId}/cards`, {
        method: "POST",
        accessToken,
        body: { title },
      });
      setCardsById((prev) => ({ ...prev, [created.id]: created }));
      // Guarded the same way the socket CARD_CREATED handler is — the
      // real-time event for this exact card can arrive over the socket
      // BEFORE this HTTP response resolves (they race independently), so
      // without this check the card gets appended twice in the tab that
      // created it: once from the socket event, once from here.
      setLists((prev) =>
        prev.map((list) =>
          list.id === listId && !list.cardOrder.includes(created.id)
            ? { ...list, cardOrder: [...list.cardOrder, created.id] }
            : list
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add card");
    }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      await apiFetch(`/cards/${cardId}`, { method: "DELETE", accessToken });
      setCardsById((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setLists((prev) =>
        prev.map((list) => ({ ...list, cardOrder: list.cardOrder.filter((id) => id !== cardId) }))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete card");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveCard(cardsById[event.active.id as string] ?? null);
  }

  /**
   * Core drag-and-drop logic. `over.id` is either another card's id
   * (dropped near/on a card) or a "column-<listId>" id (dropped into an
   * empty column, or below the last card). We resolve both cases down to
   * "destination list id + destination index", update local state
   * optimistically, then persist via the moveCard endpoint.
   */
  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const activeCardId = active.id as string;
    const overId = over.id as string;

    const sourceList = lists.find((l) => l.cardOrder.includes(activeCardId));
    if (!sourceList) return;

    let destListId: string;
    let destIndex: number;

    if (overId.startsWith("column-")) {
      // Dropped directly on a column (usually an empty one, or the gap
      // below the last card) — place at the end of that list.
      destListId = overId.replace("column-", "");
      const destList = lists.find((l) => l.id === destListId);
      destIndex = destList ? destList.cardOrder.length : 0;
    } else {
      // Dropped on/near another card — that card's list is the
      // destination, at that card's current index.
      const destList = lists.find((l) => l.cardOrder.includes(overId));
      if (!destList) return;
      destListId = destList.id;
      destIndex = destList.cardOrder.indexOf(overId);
    }

    if (sourceList.id === destListId && sourceList.cardOrder.indexOf(activeCardId) === destIndex) {
      return; // dropped back where it started — nothing to do
    }

    // Optimistic local update — the UI reflects the move immediately,
    // before the backend confirms it. If the API call below fails, we
    // reload from the server to correct any drift rather than leaving the
    // UI in a state the backend never agreed to.
    setLists((prev) => {
      const next = prev.map((l) => ({ ...l, cardOrder: [...l.cardOrder] }));
      const from = next.find((l) => l.id === sourceList.id)!;
      from.cardOrder = from.cardOrder.filter((id) => id !== activeCardId);
      const to = next.find((l) => l.id === destListId)!;
      to.cardOrder.splice(destIndex, 0, activeCardId);
      return next;
    });

    try {
      await apiFetch(`/cards/${activeCardId}/move`, {
        method: "PATCH",
        accessToken,
        body: { toListId: destListId, newIndex: destIndex },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to move card — reloading board");
      loadBoard(); // resync with the server's actual state
    }
  }

  if (authLoading || isLoadingBoard) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading board...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-6">
      <Link
        href={board ? `/workspaces/${board.workspaceId}` : "/workspaces"}
        className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-800"
      >
        ← Back to boards
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">{board?.title}</h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {lists.map((list) => (
            <BoardColumn
              key={list.id}
              listId={list.id}
              title={list.title}
              cards={list.cardOrder.map((id) => cardsById[id]).filter(Boolean)}
              onAddCard={handleAddCard}
              onDeleteCard={handleDeleteCard}
            />
          ))}

          <form onSubmit={handleCreateList} className="w-72 shrink-0">
            <input
              type="text"
              placeholder="+ Add a list"
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              className="w-full rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </form>
        </div>

        {/* Renders a floating copy of the card being dragged, following the
            cursor — without this, dnd-kit only moves the original element,
            which can look janky mid-drag across columns. */}
        <DragOverlay>
          {activeCard ? <TaskCard card={activeCard} onDelete={() => {}} /> : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
