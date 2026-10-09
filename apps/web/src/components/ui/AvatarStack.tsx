"use client";

import { avatarColorFor, initialsFor } from "@/lib/avatar";
import type { WorkspaceMember } from "@fluxboard/shared-types";

interface AvatarStackProps {
  members: WorkspaceMember[];
  activeMemberIds?: string[];
  onClick?: () => void;
  /** How many circles to render before collapsing the rest into a "+N" bubble. */
  max?: number;
  size?: "sm" | "md";
}

const SIZE_CLASSES = {
  sm: "h-7 w-7 text-[11px] -ml-2 first:ml-0",
  md: "h-9 w-9 text-xs -ml-2.5 first:ml-0",
};

/**
 * The overlapping circle-of-avatars pattern seen at the top of most
 * collaborative apps (Trello, Linear, Figma, ...) — a compact, at-a-glance
 * answer to "who has access to this?". Purely a trigger button: clicking
 * it is meant to open a MembersModal for the actual invite/remove/detail
 * UI, this component only renders the summary.
 */
export function AvatarStack({
  members,
  activeMemberIds,
  onClick,
  max = 4,
  size = "md",
}: AvatarStackProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  const activeMembers = new Set(activeMemberIds ?? []);
  const activeCount = members.filter((member) => activeMembers.has(member.id)).length;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title="View or manage board members"
      aria-label={
        activeMemberIds
          ? `${members.length} member${members.length === 1 ? "" : "s"}, ${activeCount} currently viewing this board — view or manage`
          : `${members.length} member${members.length === 1 ? "" : "s"} — view or manage`
      }
      className="group flex items-center rounded-full transition hover:opacity-90 disabled:cursor-default"
    >
      {visible.map((member, index) => (
        <span
          key={member.id}
          title={`${member.displayName}${member.role === "owner" ? " (owner)" : ""}${activeMembers.has(member.id) ? " — viewing this board" : ""}`}
          style={{ zIndex: visible.length - index }}
          className={`relative flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ${
            activeMembers.has(member.id) ? "ring-emerald-500 ring-offset-1" : "ring-white"
          } ${sizeClass} ${avatarColorFor(member.id)}`}
        >
          {initialsFor(member.displayName)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={`relative flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 ring-2 ${
            members.slice(max).some((member) => activeMembers.has(member.id))
              ? "ring-emerald-500 ring-offset-1"
              : "ring-white"
          } ${sizeClass}`}
          title={`${overflow} more member${overflow === 1 ? "" : "s"}`}
        >
          +{overflow}
        </span>
      )}
    </button>
  );
}
