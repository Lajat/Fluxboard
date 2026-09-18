"use client";

import { useEffect, useState, useRef, useCallback, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useAuth } from "@/context/AuthContext";
import { useActiveWorkspace } from "@/context/ActiveWorkspaceContext";
import { useToast } from "@/components/ui/Toast";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { getSocket } from "@/lib/socket";
import { BoardColumn } from "@/components/BoardColumn";
import { TaskCard } from "@/components/TaskCard";
import { CardDetailModal, type CardUpdates } from "@/components/CardDetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditableTitle } from "@/components/ui/EditableTitle";
import { AvatarStack } from "@/components/ui/AvatarStack";
import { MembersModal } from "@/components/MembersModal";
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon, PlusIcon, SpinnerIcon } from "@/components/ui/icons";
import type { Board, List, Card, Workspace, WorkspaceMember, MemberPermissions } from "@fluxboard/shared-types";
import {
  SocketEvents,
  type CardMovedPayload,
  type WorkspaceMembershipPayload,
  type MemberPermissionsUpdatedPayload,
} from "@fluxboard/shared-types";

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
  const { showToast } = useToast();
  const router = useRouter();
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;

  const [board, setBoard] = useState<Board | null>(null);
  const [lists, setLists] = useState<ListWithCards[]>([]);
  const [cardsById, setCardsById] = useState<Record<string, Card>>({});
  const [newListTitle, setNewListTitle] = useState("");
  const [isAddingList, setIsAddingList] = useState(false);
  const [listTitleError, setListTitleError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [confirmingBoardDelete, setConfirmingBoardDelete] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const { setActiveWorkspaceId } = useActiveWorkspace();

  // Tell the sidebar which workspace this board belongs to, once we know
  // it — a board page only has boardId in its URL, so this can't be set
  // until the board itself has loaded. See ActiveWorkspaceContext.
  useEffect(() => {
    if (board?.workspaceId) setActiveWorkspaceId(board.workspaceId);
  }, [board?.workspaceId, setActiveWorkspaceId]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isLoadingInviteLink, setIsLoadingInviteLink] = useState(false);
  // Computed early (rather than inline in JSX) because it's also needed
  // inside a useEffect further down, and hooks can't follow a conditional
  // return.
  const isOwner = !!(workspace && user && workspace.ownerId === user.id);
  // The current user's own permissions in this board's workspace, derived
  // from the `members` list we already fetch for the avatar stack. While
  // `members` hasn't loaded yet, default to full permissions rather than
  // locking every button — the real enforcement is server-side anyway
  // (see apps/api/src/lib/permissions.ts), so this is purely a UX default
  // to avoid a flash of disabled buttons before the fetch resolves.
  const myPermissions = user
    ? members.find((m) => m.id === user.id)?.permissions ?? { canAdd: true, canEdit: true, canDelete: true }
    : { canAdd: false, canEdit: false, canDelete: false };
  // Shown once per board, on mobile only, the first time there's more
  // than fits on screen — the edge fade is a subtle enough cue that a
  // first-time visitor might miss it entirely, so this spells it out
  // once and then gets out of the way for good.
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  // Tracks whether the board's horizontal scroll container currently has
  // more content off-screen to the left/right — drives the edge fade
  // gradients and arrow buttons below, so there's always a visible cue
  // once lists overflow the viewport instead of the row just silently
  // growing off the edge of the screen.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 4;
    setCanScrollLeft(!atStart);
    // The -4 tolerance absorbs sub-pixel rounding so the right-edge fade
    // doesn't flicker on/off when the content width is (basically) exactly
    // the container width.
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    // Any real scroll movement means the user has already discovered they
    // can scroll — dismiss the hint immediately rather than waiting out
    // its timer.
    if (!atStart) setShowSwipeHint(false);
  }, []);

  // The first time this board's lists overflow the screen, show the
  // one-time swipe hint (mobile only — see the JSX below) unless this
  // board has already shown it earlier in the session.
  useEffect(() => {
    if (!canScrollRight || !boardId) return;
    const key = `fluxboard_swipe_hint_${boardId}`;
    if (sessionStorage.getItem(key)) return;

    setShowSwipeHint(true);
    sessionStorage.setItem(key, "1");
    const timeout = setTimeout(() => setShowSwipeHint(false), 4000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScrollRight, boardId]);

  // Re-check whenever the list count changes (adding/removing a list can
  // push the row from "fits on screen" to "overflows" or back), and on
  // window resize (rotating a phone, resizing a browser window).
  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState, lists.length]);

  function scrollByColumn(direction: 1 | -1) {
    scrollRef.current?.scrollBy({ left: direction * 320, behavior: "smooth" });
  }

  // Sensors, tuned for BOTH mouse and touch:
  //  - MouseSensor: a drag only "activates" after the pointer has moved a
  //    few pixels, so a plain click (e.g. opening the card modal) is never
  //    mistaken for a drag.
  //  - TouchSensor: on a touchscreen there's no separate click vs.
  //    drag-start distinction the way there is with a mouse, so instead we
  //    require a short press-and-hold (delay) before a drag begins. This
  //    is the actual fix for "can't drag on mobile" — without a dedicated
  //    TouchSensor, dnd-kit's PointerSensor alone frequently loses the
  //    gesture to the browser's native touch-scrolling.
  //  - KeyboardSensor: lets a card be picked up and moved with arrow keys
  //    once focused, for keyboard/accessibility support.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  // The board response only carries workspaceId, not the workspace's own
  // name/owner or its member list — fetched separately once we know which
  // workspace this board belongs to, purely to power the avatar
  // stack + members modal in the header (mirrors the same pattern as the
  // workspace boards-list page).
  useEffect(() => {
    if (!accessToken || !board?.workspaceId) return;
    Promise.all([
      apiFetch<Workspace>(`/workspaces/${board.workspaceId}`, { accessToken }),
      apiFetch<{ items: WorkspaceMember[] }>(`/workspaces/${board.workspaceId}/members`, {
        accessToken,
      }),
    ])
      .then(([ws, membersRes]) => {
        setWorkspace(ws);
        setMembers(membersRes.items);
      })
      .catch(() => {
        // Non-critical for this page — the board itself still works fine
        // without the avatar stack, so fail silently rather than
        // interrupting the board with a toast for a secondary feature.
      });
  }, [accessToken, board?.workspaceId]);

  // Workspace-level real-time awareness: this board can disappear (this
  // exact board deleted, or its whole workspace deleted) or get renamed by
  // someone else, and the member list can change — all while this page is
  // open and only joined to the BOARD's room, not the workspace's. This
  // separate effect/room is what catches those cases.
  useEffect(() => {
    if (!board?.workspaceId || !accessToken) return;
    const socket = getSocket();
    const workspaceId = board.workspaceId;
    socket.emit("join-workspace", workspaceId);
    function rejoinWorkspaceOnReconnect() {
      socket.emit("join-workspace", workspaceId);
    }
    socket.on("connect", rejoinWorkspaceOnReconnect);

    function handleBoardUpdated(updated: Board) {
      if (updated.id !== boardId) return;
      setBoard(updated);
    }

    function handleBoardDeleted(deleted: Board) {
      if (deleted.id !== boardId) return;
      showToast(`"${deleted.title}" was deleted`, "error");
      router.replace(`/workspaces/${workspaceId}`);
    }

    function handleWorkspaceDeleted(deleted: Workspace) {
      if (deleted.id !== workspaceId) return;
      showToast(`"${deleted.name}" was deleted`, "error");
      router.replace("/workspaces");
    }

    function handleMemberAdded({ workspaceId: wsId, member }: WorkspaceMembershipPayload) {
      if (wsId !== workspaceId) return;
      setMembers((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
    }

    function handleMemberRemoved({
      workspaceId: wsId,
      userId,
    }: {
      workspaceId: string;
      userId: string;
    }) {
      if (wsId !== workspaceId) return;
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    }

    function handleMemberPermissionsUpdated({ workspaceId: wsId, member }: MemberPermissionsUpdatedPayload) {
      if (wsId !== workspaceId) return;
      setMembers((prev) => prev.map((m) => (m.id === member.id ? member : m)));
    }

    socket.on(SocketEvents.BOARD_UPDATED, handleBoardUpdated);
    socket.on(SocketEvents.BOARD_DELETED, handleBoardDeleted);
    socket.on(SocketEvents.WORKSPACE_DELETED, handleWorkspaceDeleted);
    socket.on(SocketEvents.MEMBER_ADDED, handleMemberAdded);
    socket.on(SocketEvents.MEMBER_REMOVED, handleMemberRemoved);
    socket.on(SocketEvents.MEMBER_PERMISSIONS_UPDATED, handleMemberPermissionsUpdated);

    return () => {
      socket.emit("leave-workspace", workspaceId);
      socket.off("connect", rejoinWorkspaceOnReconnect);
      socket.off(SocketEvents.BOARD_UPDATED, handleBoardUpdated);
      socket.off(SocketEvents.BOARD_DELETED, handleBoardDeleted);
      socket.off(SocketEvents.WORKSPACE_DELETED, handleWorkspaceDeleted);
      socket.off(SocketEvents.MEMBER_ADDED, handleMemberAdded);
      socket.off(SocketEvents.MEMBER_REMOVED, handleMemberRemoved);
      socket.off(SocketEvents.MEMBER_PERMISSIONS_UPDATED, handleMemberPermissionsUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.workspaceId, boardId, accessToken]);

  // Real-time sync: join this board's room and apply events from OTHER
  // clients (and, harmlessly, our own — every handler below is written to
  // be idempotent, so re-applying an event we already reflected locally
  // via optimistic UI just re-does the same no-op change).
  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket();
    socket.emit("join-board", boardId);
    // Room membership lives on the server-side connection and is wiped
    // out on every disconnect — a dropped wifi connection or a laptop
    // waking from sleep silently reconnects the underlying socket but
    // leaves it in no rooms at all unless we explicitly rejoin here.
    function rejoinOnReconnect() {
      socket.emit("join-board", boardId);
    }
    socket.on("connect", rejoinOnReconnect);

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

    function handleCardUpdated(card: Card) {
      setCardsById((prev) => (prev[card.id] ? { ...prev, [card.id]: card } : prev));
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

    function handleListUpdated(list: List) {
      setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, title: list.title } : l)));
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
    socket.on(SocketEvents.CARD_UPDATED, handleCardUpdated);
    socket.on(SocketEvents.CARD_DELETED, handleCardDeleted);
    socket.on(SocketEvents.CARD_MOVED, handleCardMoved);
    socket.on(SocketEvents.LIST_CREATED, handleListCreated);
    socket.on(SocketEvents.LIST_UPDATED, handleListUpdated);
    socket.on(SocketEvents.LIST_DELETED, handleListDeleted);
    socket.on(SocketEvents.LIST_REORDERED, handleListReordered);

    return () => {
      socket.emit("leave-board", boardId);
      socket.off("connect", rejoinOnReconnect);
      socket.off(SocketEvents.CARD_CREATED, upsertCard);
      socket.off(SocketEvents.CARD_UPDATED, handleCardUpdated);
      socket.off(SocketEvents.CARD_DELETED, handleCardDeleted);
      socket.off(SocketEvents.CARD_MOVED, handleCardMoved);
      socket.off(SocketEvents.LIST_CREATED, handleListCreated);
      socket.off(SocketEvents.LIST_UPDATED, handleListUpdated);
      socket.off(SocketEvents.LIST_DELETED, handleListDeleted);
      socket.off(SocketEvents.LIST_REORDERED, handleListReordered);
    };
  }, [boardId, accessToken]);

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
      showToast(err instanceof ApiError ? err.message : "Failed to load board", "error");
    } finally {
      setIsLoadingBoard(false);
    }
  }

  async function handleRenameBoard(nextTitle: string) {
    try {
      const updated = await apiFetch<Board>(`/boards/${boardId}`, {
        method: "PATCH",
        accessToken,
        body: { title: nextTitle },
      });
      setBoard(updated);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to rename board", "error");
    }
  }

  async function handleDeleteBoard() {
    try {
      await apiFetch(`/boards/${boardId}`, { method: "DELETE", accessToken });
      showToast("Board deleted");
      router.push(board ? `/workspaces/${board.workspaceId}` : "/workspaces");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to delete board", "error");
    }
  }

  async function handleInviteMember(email: string) {
    if (!board) return;
    const res = await apiFetch<{ workspace: Workspace; member: WorkspaceMember }>(
      `/workspaces/${board.workspaceId}/members`,
      { method: "POST", accessToken, body: { email } }
    );
    setMembers((prev) => (prev.some((m) => m.id === res.member.id) ? prev : [...prev, res.member]));
    showToast(`${res.member.displayName} was added to the workspace`);
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    if (!board) return;
    try {
      await apiFetch(`/workspaces/${board.workspaceId}/members/${member.id}`, {
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
    if (!board) return;
    try {
      const res = await apiFetch<{ member: WorkspaceMember }>(
        `/workspaces/${board.workspaceId}/members/${member.id}/permissions`,
        { method: "PATCH", accessToken, body: updates }
      );
      setMembers((prev) => prev.map((m) => (m.id === res.member.id ? res.member : m)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update permissions", "error");
    }
  }

  // Lazily fetch the invite link only once the owner actually opens the
  // members modal — see the identical pattern (and full reasoning) on the
  // workspace boards-list page.
  useEffect(() => {
    if (!isMembersModalOpen || !isOwner || inviteToken || !accessToken || !board?.workspaceId) return;
    setIsLoadingInviteLink(true);
    apiFetch<{ token: string }>(`/workspaces/${board.workspaceId}/invite-link`, { accessToken })
      .then((res) => setInviteToken(res.token))
      .catch((err) => showToast(err instanceof ApiError ? err.message : "Failed to load invite link", "error"))
      .finally(() => setIsLoadingInviteLink(false));
  }, [isMembersModalOpen, isOwner, inviteToken, accessToken, board?.workspaceId, showToast]);

  async function handleRegenerateInviteLink() {
    if (!board) return;
    try {
      const res = await apiFetch<{ token: string }>(
        `/workspaces/${board.workspaceId}/invite-link/regenerate`,
        { method: "POST", accessToken }
      );
      setInviteToken(res.token);
      showToast("Invite link regenerated");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to regenerate invite link", "error");
    }
  }

  async function handleCreateList(e: FormEvent) {
    e.preventDefault();
    if (!newListTitle.trim()) {
      setListTitleError("List name is required.");
      return;
    }

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
      setIsAddingList(false);
      setListTitleError(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to create list", "error");
    }
  }

  async function handleRenameList(listId: string, title: string) {
    try {
      await apiFetch<List>(`/boards/${boardId}/lists/${listId}`, {
        method: "PATCH",
        accessToken,
        body: { title },
      });
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, title } : l)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to rename list", "error");
    }
  }

  async function handleDeleteList(listId: string) {
    try {
      await apiFetch(`/boards/${boardId}/lists/${listId}`, { method: "DELETE", accessToken });
      setLists((prev) => prev.filter((l) => l.id !== listId));
      showToast("List deleted");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to delete list", "error");
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
      showToast(err instanceof ApiError ? err.message : "Failed to add card", "error");
    }
  }

  async function handleSaveCard(cardId: string, updates: CardUpdates) {
    try {
      const updated = await apiFetch<Card>(`/cards/${cardId}`, {
        method: "PATCH",
        accessToken,
        body: updates,
      });
      setCardsById((prev) => ({ ...prev, [cardId]: updated }));
      showToast("Card updated");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update card", "error");
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
      showToast(err instanceof ApiError ? err.message : "Failed to delete card", "error");
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
      showToast(
        err instanceof ApiError ? err.message : "Failed to move card — reloading board",
        "error"
      );
      loadBoard(); // resync with the server's actual state
    }
  }

  if (authLoading || isLoadingBoard) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <SpinnerIcon className="h-6 w-6 text-brand-500" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <Link
          href={board ? `/workspaces/${board.workspaceId}` : "/workspaces"}
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Back to boards
        </Link>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <EditableTitle
              as="h1"
              value={board?.title ?? ""}
              onSave={handleRenameBoard}
              disabled={!myPermissions.canEdit}
              className="text-xl font-bold text-slate-900 sm:text-2xl"
              inputClassName="w-full max-w-md rounded-md border border-brand-300 bg-white px-2 py-1 text-xl font-bold text-slate-900 outline-none ring-2 ring-brand-100 sm:text-2xl"
            />
            {lists.length > 0 && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {lists.length} list{lists.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {members.length > 0 && (
              <AvatarStack
                members={members}
                onClick={() => setIsMembersModalOpen(true)}
                size="sm"
              />
            )}
            {myPermissions.canDelete && (
              <button
                onClick={() => setConfirmingBoardDelete(true)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 hover:bg-red-50 hover:text-red-500"
              >
                <TrashIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Delete board</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Relative wrapper so the fade gradients and arrow buttons can sit
            on top of the scrollable row at fixed screen edges. */}
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            className="board-scroll scrollbar-thin flex h-full items-start gap-3 overflow-x-auto p-4 sm:gap-4 sm:p-6"
          >
            {lists.map((list) => (
              <BoardColumn
                key={list.id}
                listId={list.id}
                title={list.title}
                cards={list.cardOrder.map((id) => cardsById[id]).filter(Boolean)}
                members={members}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onOpenCard={setOpenCard}
                onRenameList={handleRenameList}
                onDeleteList={handleDeleteList}
                canAdd={myPermissions.canAdd}
                canEdit={myPermissions.canEdit}
                canDelete={myPermissions.canDelete}
              />
            ))}

            {myPermissions.canAdd && (
            <div className="board-column-snap w-[85vw] shrink-0 sm:w-72">
              {isAddingList ? (
                <form onSubmit={handleCreateList} className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200">
                  <input
                    autoFocus
                    type="text"
                    placeholder="List name"
                    value={newListTitle}
                    onChange={(e) => {
                      setNewListTitle(e.target.value);
                      if (listTitleError) setListTitleError(null);
                    }}
                    onKeyDown={(e) => e.key === "Escape" && setIsAddingList(false)}
                    aria-invalid={!!listTitleError}
                    className={`w-full rounded-md border px-2.5 py-1.5 text-sm outline-none ring-2 ${
                      listTitleError ? "border-red-300 ring-red-100" : "border-brand-300 ring-brand-100"
                    }`}
                  />
                  {listTitleError && <p className="mt-1 text-xs text-red-600">{listTitleError}</p>}
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="submit"
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                    >
                      Add list
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingList(false);
                        setListTitleError(null);
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setIsAddingList(true)}
                  className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-3 text-sm text-slate-500 hover:border-brand-300 hover:bg-white hover:text-brand-600"
                >
                  <PlusIcon className="h-4 w-4" /> Add a list
                </button>
              )}
            </div>
            )}
          </div>

          {/* Left/right edge cues + scroll arrows. The edge cue is a
              soft, low-opacity black shadow — NOT the previous flat
              slate-50 color panel. That's the actual fix: an opaque
              background color painted over a card visibly washes it out
              as it passes underneath (cards are white/bordered, so a
              solid color panel replaces their color entirely in that
              strip); a subtle shadow-style gradient (5% black, fading to
              transparent) barely darkens whatever's beneath it instead of
              replacing it — still a visible "there's more here" cue, on
              every screen size (mobile has no hover state, so this is
              also mobile's persistent equivalent of the buttons below),
              without the translucent-card side effect. */}
          {canScrollLeft && (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-6 bg-gradient-to-r from-black/5 to-transparent sm:w-10" />
              <button
                onClick={() => scrollByColumn(-1)}
                aria-label="Scroll lists left"
                className="absolute left-2 top-1/2 z-[1] hidden -translate-y-1/2 rounded-full bg-white p-1.5 text-slate-500 shadow-md ring-1 ring-slate-200 transition hover:text-brand-600 sm:flex"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            </>
          )}

          {canScrollRight && (
            <>
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-6 bg-gradient-to-l from-black/5 to-transparent sm:w-10" />
              <button
                onClick={() => scrollByColumn(1)}
                aria-label="Scroll lists right"
                className="absolute right-2 top-1/2 z-[1] hidden -translate-y-1/2 rounded-full bg-white p-1.5 text-slate-500 shadow-md ring-1 ring-slate-200 transition hover:text-brand-600 sm:flex"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </>
          )}

          {/* One-time mobile-only nudge — see the effect above for when
              this shows/hides. Positioned low so it never sits over a
              card someone might be trying to tap. */}
          {showSwipeHint && (
            <div className="pointer-events-none absolute bottom-4 right-3 z-[2] flex animate-[toast-in_0.2s_ease-out] items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg sm:hidden">
              Swipe for more lists
              <ChevronRightIcon className="h-3.5 w-3.5 animate-pulse" />
            </div>
          )}
        </div>

        {/* Renders a floating copy of the card being dragged, following the
            cursor — without this, dnd-kit only moves the original element,
            which can look janky mid-drag across columns. */}
        <DragOverlay>
          {activeCard ? <TaskCard card={activeCard} onDelete={() => {}} /> : null}
        </DragOverlay>
      </DndContext>

      <CardDetailModal
        card={openCard}
        members={members}
        onClose={() => setOpenCard(null)}
        onSave={handleSaveCard}
        onDelete={handleDeleteCard}
        canEdit={myPermissions.canEdit}
        canDelete={myPermissions.canDelete}
      />

      <ConfirmDialog
        open={confirmingBoardDelete}
        title="Delete this board?"
        description={`"${board?.title}" and every list and card on it will be permanently deleted.`}
        onCancel={() => setConfirmingBoardDelete(false)}
        onConfirm={handleDeleteBoard}
      />

      {user && workspace && (
        <MembersModal
          open={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          workspaceName={workspace.name}
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
