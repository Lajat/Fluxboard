"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface ActiveWorkspaceContextValue {
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
}

const ActiveWorkspaceContext = createContext<ActiveWorkspaceContextValue | null>(null);

/**
 * Tracks which workspace the person is currently "inside", so the sidebar
 * can auto-expand and highlight the right one — including on a board page,
 * which only knows its own boardId from the URL, not which workspace it
 * belongs to, until it fetches the board. Rather than have the Sidebar
 * duplicate that fetch just to figure out where it is, the workspace
 * detail page and the board page each call setActiveWorkspaceId once they
 * know it, and the Sidebar just reads it back.
 */
export function ActiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  return (
    <ActiveWorkspaceContext.Provider value={{ activeWorkspaceId, setActiveWorkspaceId }}>
      {children}
    </ActiveWorkspaceContext.Provider>
  );
}

export function useActiveWorkspace(): ActiveWorkspaceContextValue {
  const ctx = useContext(ActiveWorkspaceContext);
  if (!ctx) {
    throw new Error("useActiveWorkspace must be used within an <ActiveWorkspaceProvider>");
  }
  return ctx;
}
