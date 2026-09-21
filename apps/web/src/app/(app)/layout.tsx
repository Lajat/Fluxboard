"use client";

import { ActiveWorkspaceProvider } from "@/context/ActiveWorkspaceContext";
import { Sidebar } from "@/components/ui/Sidebar";

/**
 * Layout for every page under the (app) route group — currently
 * /workspaces, /workspaces/[id], and /boards/[id]. A route group's
 * parentheses are stripped from the actual URL, so this doesn't change
 * any path; it only lets these three pages share the sidebar without
 * login/signup/invite (which live outside this group) getting it too.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActiveWorkspaceProvider>
      <div className="app-shell flex">
        <Sidebar />
        {/* pt-14 clears the fixed mobile top bar Sidebar renders (see
            Sidebar.tsx) — without this, every page's own content would
            render UNDER that bar on mobile, since "fixed" positioning
            takes it out of normal document flow entirely. Not needed on
            desktop (sm:pt-0), where that bar doesn't exist at all. */}
        <div className="min-w-0 flex-1 pt-14 sm:pt-0">{children}</div>
      </div>
    </ActiveWorkspaceProvider>
  );
}
