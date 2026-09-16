"use client";

import { useState, FormEvent } from "react";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { avatarColorFor, initialsFor } from "@/lib/avatar";
import { emailError as getEmailError } from "@/lib/validation";
import { UserPlusIcon, TrashIcon, SpinnerIcon, LinkIcon, CheckIcon } from "./ui/icons";
import type { WorkspaceMember } from "@fluxboard/shared-types";

interface MembersModalProps {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  members: WorkspaceMember[];
  isOwner: boolean;
  currentUserId: string;
  onInvite: (email: string) => Promise<void>;
  onRemove: (member: WorkspaceMember) => Promise<void>;
  /** Full shareable URL (e.g. "https://app.com/invite/abc123"), or null while it's still loading/not yet fetched. Owner-only feature — parent only needs to fetch this when isOwner is true. */
  inviteLink: string | null;
  isLoadingInviteLink: boolean;
  onRegenerateInviteLink: () => Promise<void>;
}

/**
 * Full members panel for a workspace: shows everyone with access, and —
 * owner only — two ways to bring someone in (invite by email, or share a
 * join link), plus a remove button per member. Non-owners get a read-only
 * view of who they're collaborating with, which is exactly what the
 * avatar stack that opens this modal implies ("here's who's on this")
 * without exposing membership management to people who shouldn't have it.
 */
export function MembersModal({
  open,
  onClose,
  workspaceName,
  members,
  isOwner,
  currentUserId,
  onInvite,
  onRemove,
  inviteLink,
  isLoadingInviteLink,
  onRegenerateInviteLink,
}: MembersModalProps) {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [removingMember, setRemovingMember] = useState<WorkspaceMember | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const validationError = getEmailError(email);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setInviteError(null);
    if (validationError) return;

    setIsInviting(true);
    try {
      await onInvite(email.trim());
      setEmail("");
      setTouched(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite.");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleCopyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, insecure context, very
      // old browser) — the link is still selectable/copyable by hand
      // right there in the input, so this isn't a hard failure.
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={`${workspaceName} · Members`} widthClassName="max-w-md">
        {isOwner && (
          <div className="mb-5 space-y-4">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <LinkIcon className="h-3.5 w-3.5" /> Invite link
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={isLoadingInviteLink ? "Loading..." : inviteLink ?? ""}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={!inviteLink}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-900 disabled:opacity-50"
                >
                  {justCopied ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
                  {justCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Anyone with this link and a fluxboard account can join instantly.{" "}
                <button
                  onClick={() => setConfirmingRegenerate(true)}
                  className="font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
                >
                  Regenerate link
                </button>
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <div className="h-px flex-1 bg-slate-100" />
              or
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            <form onSubmit={handleInvite} className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Invite by email..."
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (inviteError) setInviteError(null);
                  }}
                  onBlur={() => setTouched(true)}
                  aria-invalid={touched && !!validationError}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                    touched && validationError
                      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                      : "border-slate-200 focus:border-brand-400 focus:ring-brand-100"
                  }`}
                />
                <button
                  type="submit"
                  disabled={isInviting}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {isInviting ? <SpinnerIcon className="h-4 w-4" /> : <UserPlusIcon className="h-4 w-4" />}
                  Invite
                </button>
              </div>
              {touched && validationError && <p className="text-xs text-red-600">{validationError}</p>}
              {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
              <p className="mt-0.5 text-xs text-slate-400">
                They need an existing fluxboard account with this email.
              </p>
            </form>
          </div>
        )}

        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColorFor(
                  member.id
                )}`}
              >
                {initialsFor(member.displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {member.displayName}
                  {member.id === currentUserId && (
                    <span className="ml-1.5 font-normal text-slate-400">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-400">{member.email}</p>
              </div>
              {member.role === "owner" ? (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                  Owner
                </span>
              ) : (
                isOwner && (
                  <button
                    onClick={() => setRemovingMember(member)}
                    aria-label={`Remove ${member.displayName}`}
                    className="shrink-0 rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      </Modal>

      <ConfirmDialog
        open={!!removingMember}
        title="Remove this member?"
        description={`${removingMember?.displayName} will immediately lose access to "${workspaceName}" and every board in it — including any board they currently have open.`}
        confirmLabel="Remove"
        onCancel={() => setRemovingMember(null)}
        onConfirm={async () => {
          if (removingMember) await onRemove(removingMember);
          setRemovingMember(null);
        }}
      />

      <ConfirmDialog
        open={confirmingRegenerate}
        title="Regenerate the invite link?"
        description="The current link will stop working immediately. Anyone you've already shared it with will need the new one."
        confirmLabel="Regenerate"
        danger={false}
        onCancel={() => setConfirmingRegenerate(false)}
        onConfirm={async () => {
          await onRegenerateInviteLink();
          setConfirmingRegenerate(false);
        }}
      />
    </>
  );
}
