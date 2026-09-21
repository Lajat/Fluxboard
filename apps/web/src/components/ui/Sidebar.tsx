"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useActiveWorkspace } from "@/context/ActiveWorkspaceContext";
import { apiFetch } from "@/lib/apiClient";
import { getSocket } from "@/lib/socket";
import { APP_NAME } from "@/lib/constants";
import { avatarColorFor, initialsFor } from "@/lib/avatar";
import {
  LayoutIcon,
  FolderIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  MenuIcon,
  XIcon,
  LogOutIcon,
  PlusIcon,
  SpinnerIcon,
} from "./icons";
import type { Board, Workspace } from "@fluxboard/shared-types";
import {
  SocketEvents,
  type WorkspaceMembershipPayload,
  type AccessRevokedPayload,
} from "@fluxboard/shared-types";

const COLLAPSE_STORAGE_KEY = "fluxboard_sidebar_collapsed";

/**
 * Persistent navigation for every authenticated page: lists every
 * workspace the user belongs to, and — expanded on click — the boards
 * inside it, so switching between them never requires the "back to
 * workspaces" round trip the individual pages otherwise need.
 *
 * Responsive in two different ways depending on screen size:
 *  - Desktop (sm+): a persistent rail, collapsible between a full view
 *    (names visible) and an icon-only rail — state remembered in
 *    localStorage across visits.
 *  - Mobile: hidden by default as an off-canvas drawer, opened via a
 *    floating hamburger button and closed on backdrop click or navigating
 *    anywhere (so it never lingers open over the page you just navigated
 *    to).
 */
export function Sidebar() {
  const { user, accessToken, logout } = useAuth();
  const { activeWorkspaceId } = useActiveWorkspace();
  const pathname = usePathname();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [boardsByWorkspace, setBoardsByWorkspace] = useState<Record<string, Board[]>>({});
  const [loadingBoardsFor, setLoadingBoardsFor] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const deletedWorkspaceIds = useRef(new Set<string>());
  // The desktop preference is shared through localStorage, but the mobile
  // drawer always needs its full labels regardless of that preference.
  const isEffectivelyCollapsed = isCollapsed && !isMobileOpen;

  // Restore the desktop collapsed/expanded preference — read once on
  // mount, guarded for SSR since localStorage doesn't exist there.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(COLLAPSE_STORAGE_KEY) : null;
    if (stored) setIsCollapsed(stored === "1");
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ items: Workspace[] }>("/workspaces", { accessToken })
      .then((res) => {
        // Preserve a workspace announced by the socket while this request
        // was in flight; the response may be an older snapshot.
        setWorkspaces((prev) => {
          const fetched = res.items.filter((workspace) => !deletedWorkspaceIds.current.has(workspace.id));
          const fetchedIds = new Set(fetched.map((workspace) => workspace.id));
          return [...fetched, ...prev.filter((workspace) => !fetchedIds.has(workspace.id))];
        });
      })
      .catch(() => {
        // Non-critical for the rest of the app to function — the sidebar
        // just stays empty rather than blocking the page with an error.
      });
  }, [accessToken]);

  // Keeps the sidebar's own workspace list in sync with membership
  // changes, live — without this, the sidebar fetches once on mount and
  // then never updates: getting added to a new workspace, or removed
  // from one, wouldn't be reflected here until a full page reload, even
  // though every OTHER part of the app (the /workspaces grid, the global
  // access-revoked redirect) already reacts to these events.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    function handleMemberAdded(payload: WorkspaceMembershipPayload & { workspace?: Workspace }) {
      if (payload.member.id !== user!.id || !payload.workspace) return;
      deletedWorkspaceIds.current.delete(payload.workspace.id);
      setWorkspaces((prev) =>
        prev.some((ws) => ws.id === payload.workspace!.id) ? prev : [...prev, payload.workspace!]
      );
    }

    function handleAccessRevoked(payload: AccessRevokedPayload) {
      deletedWorkspaceIds.current.add(payload.workspaceId);
      setWorkspaces((prev) => prev.filter((ws) => ws.id !== payload.workspaceId));
      setBoardsByWorkspace((prev) => {
        const next = { ...prev };
        delete next[payload.workspaceId];
        return next;
      });
    }

    // Neither the sidebar nor the main /workspaces grid ever joins a
    // workspace's own room (only its detail/board pages do), so a plain
    // room-scoped WORKSPACE_DELETED broadcast never reached here at all
    // — the backend now also emits this directly to every member's own
    // personal room specifically so this handler receives it regardless
    // of which page the member is currently on. Same cleanup as
    // handleAccessRevoked above, since losing access and the workspace
    // itself ceasing to exist have the same effect on this component's
    // state either way.
    function handleWorkspaceDeleted(workspace: Workspace) {
      deletedWorkspaceIds.current.add(workspace.id);
      setWorkspaces((prev) => prev.filter((ws) => ws.id !== workspace.id));
      setBoardsByWorkspace((prev) => {
        const next = { ...prev };
        delete next[workspace.id];
        return next;
      });
    }

    // Without this, a new board only ever shows up in whichever tab
    // created it, and only after that tab's own HTTP response — the
    // sidebar's boardsByWorkspace map is separate local state, so it
    // never learns a board was created unless something tells it to.
    // The workspace board-list page already joins `workspace:<id>` via
    // "join-workspace" when you're viewing it, and since the socket
    // connection is a shared singleton (see lib/socket.ts), the sidebar
    // receives events for any room joined from anywhere in the app —
    // it just never had a handler registered for this one. Only update
    // a workspace's board list if it's already loaded (i.e. previously
    // expanded) — for one that hasn't been fetched yet, the normal
    // lazy-load in loadBoards() will correctly pick it up whenever the
    // user actually expands it.
    function handleBoardCreated(board: Board) {
      setBoardsByWorkspace((prev) => {
        if (!prev[board.workspaceId]) return prev;
        if (prev[board.workspaceId].some((b) => b.id === board.id)) return prev;
        return { ...prev, [board.workspaceId]: [...prev[board.workspaceId], board] };
      });
    }

    function handleBoardDeleted(board: Board) {
      setBoardsByWorkspace((prev) => {
        if (!prev[board.workspaceId]) return prev;
        return {
          ...prev,
          [board.workspaceId]: prev[board.workspaceId].filter((b) => b.id !== board.id),
        };
      });
    }

    socket.on(SocketEvents.MEMBER_ADDED, handleMemberAdded);
    socket.on(SocketEvents.ACCESS_REVOKED, handleAccessRevoked);
    socket.on(SocketEvents.WORKSPACE_DELETED, handleWorkspaceDeleted);
    socket.on(SocketEvents.BOARD_CREATED, handleBoardCreated);
    socket.on(SocketEvents.BOARD_DELETED, handleBoardDeleted);
    return () => {
      socket.off(SocketEvents.MEMBER_ADDED, handleMemberAdded);
      socket.off(SocketEvents.ACCESS_REVOKED, handleAccessRevoked);
      socket.off(SocketEvents.WORKSPACE_DELETED, handleWorkspaceDeleted);
      socket.off(SocketEvents.BOARD_CREATED, handleBoardCreated);
      socket.off(SocketEvents.BOARD_DELETED, handleBoardDeleted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Auto-expand whichever workspace the current page says it's "inside"
  // (see ActiveWorkspaceContext) — this is what makes landing directly on
  // a board page still show that board's workspace expanded and
  // highlighted in the sidebar, not just workspace-list pages.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    setExpandedId(activeWorkspaceId);
    if (!boardsByWorkspace[activeWorkspaceId]) {
      loadBoards(activeWorkspaceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  // Close the mobile drawer automatically on every navigation — without
  // this, tapping a board link inside the drawer would navigate AND leave
  // the drawer sitting open over the new page.
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  async function loadBoards(workspaceId: string) {
    setLoadingBoardsFor(workspaceId);
    try {
      const res = await apiFetch<{ items: Board[] }>(`/workspaces/${workspaceId}/boards`, {
        accessToken,
      });
      setBoardsByWorkspace((prev) => ({ ...prev, [workspaceId]: res.items }));
    } catch {
      // Same reasoning as the workspaces fetch above.
    } finally {
      setLoadingBoardsFor(null);
    }
  }

  function toggleExpand(workspaceId: string) {
    if (expandedId === workspaceId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(workspaceId);
    if (!boardsByWorkspace[workspaceId]) loadBoards(workspaceId);
  }

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  if (!user) return null;

  return (
    <>
      {/* Mobile-only top bar — hidden entirely on desktop, where the
          sidebar is always visible (at minimum as an icon rail). This
          replaces what was previously an isolated floating hamburger
          button positioned independently of the page's own branding,
          which is exactly why it could end up sitting on top of it: two
          separately-positioned elements both anchored to the same
          corner. A single persistent bar containing BOTH the menu toggle
          and the logo together — the same structure Gmail/Notion/Linear
          use for their mobile web headers — means there's only one
          element in that region, so nothing can overlap it, on every
          page, since this is rendered once here rather than per-page. */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:hidden">
        <button
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open navigation"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-white">
            <LayoutIcon className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-slate-800">{APP_NAME}</span>
        </div>
      </div>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 sm:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 sm:sticky sm:top-0 sm:z-0 sm:h-screen sm:translate-x-0 sm:transition-[width] ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "sm:w-16" : "sm:w-64"}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3">
          <Link href="/workspaces" className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <LayoutIcon className="h-4 w-4" />
            </div>
            {!isEffectivelyCollapsed && (
              <span className="truncate text-sm font-semibold text-slate-800">{APP_NAME}</span>
            )}
          </Link>
          <button
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 sm:hidden"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Collapse/expand handle: a small floating tab on the sidebar's
            own edge, vertically centered — not squeezed into the header
            row alongside the logo. At 64px wide when collapsed, the
            header row has no room for a second interactive element next
            to the logo without one sitting on top of the other; a
            separate edge handle (the same pattern VS Code/Notion/Linear
            use for their collapsible sidebars) sidesteps the cramping
            entirely rather than trying to fit both into less space. */}
        <button
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm hover:text-slate-600 sm:flex"
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          )}
        </button>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
          {workspaces.map((ws) => {
            const isExpanded = expandedId === ws.id;
            const isActive = activeWorkspaceId === ws.id;
            const boards = boardsByWorkspace[ws.id];

            return (
              <div key={ws.id} className="mb-0.5">
                <div
                  className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                    isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <button
                    onClick={() => toggleExpand(ws.id)}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                    className={`shrink-0 rounded p-0.5 hover:bg-black/5 ${isEffectivelyCollapsed ? "hidden" : ""}`}
                  >
                    <ChevronDownIcon
                      className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                    />
                  </button>
                  <Link
                    href={`/workspaces/${ws.id}`}
                    title={ws.name}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    {isEffectivelyCollapsed ? (
                      // Collapsed: every workspace previously rendered as an
                      // identical plain folder icon — no way to tell them
                      // apart without hovering each one for its tooltip. A
                      // colored initial badge (same deterministic
                      // color-by-id + initials pattern already used for
                      // user avatars) makes each workspace visually
                      // distinct at a glance, the way Slack/Notion's
                      // collapsed workspace switchers do.
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white ${avatarColorFor(
                          ws.id
                        )}`}
                      >
                        {initialsFor(ws.name)}
                      </div>
                    ) : (
                      <FolderIcon className="h-4 w-4 shrink-0" />
                    )}
                    {!isEffectivelyCollapsed && <span className="truncate font-medium">{ws.name}</span>}
                  </Link>
                </div>

                {isExpanded && !isEffectivelyCollapsed && (
                  <div className="ml-6 mt-0.5 space-y-0.5 border-l border-slate-100 pl-2">
                    {loadingBoardsFor === ws.id ? (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400">
                        <SpinnerIcon className="h-3 w-3" /> Loading...
                      </div>
                    ) : (
                      <>
                        {(boards ?? []).map((board) => {
                          const isBoardActive = pathname === `/boards/${board.id}`;
                          return (
                            <Link
                              key={board.id}
                              href={`/boards/${board.id}`}
                              title={board.title}
                              className={`block truncate rounded-md px-2 py-1.5 text-xs ${
                                isBoardActive
                                  ? "bg-brand-100 font-medium text-brand-700"
                                  : "text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              {board.title}
                            </Link>
                          );
                        })}
                        {boards?.length === 0 && (
                          <p className="px-2 py-1 text-xs text-slate-300">No boards yet</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!isEffectivelyCollapsed && (
            <Link
              href="/workspaces"
              className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-50 hover:text-brand-600"
            >
              <PlusIcon className="h-3.5 w-3.5" /> New workspace
            </Link>
          )}
        </nav>

        <div className="border-t border-slate-100 p-2">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <LogOutIcon className="h-4 w-4 shrink-0" />
            {!isEffectivelyCollapsed && <span className="truncate">Log out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
