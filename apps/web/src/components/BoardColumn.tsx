"use client";

import { useState, FormEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import { EditableTitle } from "./ui/EditableTitle";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { PlusIcon, TrashIcon, XIcon } from "./ui/icons";
import type { Card, WorkspaceMember } from "@fluxboard/shared-types";

interface BoardColumnProps {
  listId: string;
  title: string;
  cards: Card[];
  members: WorkspaceMember[];
  onAddCard: (listId: string, title: string) => void;
  onDeleteCard: (cardId: string) => void;
  onOpenCard: (card: Card) => void;
  onRenameList: (listId: string, title: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  /** The CURRENT user's own permissions in this board's workspace — gates the add/rename/delete affordances below. */
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Card ids with a move currently in flight — passed through to each
   *  TaskCard as isMovePending, disabling drag on that specific card
   *  until its move finishes (see TaskCard for why this matters). */
  pendingMoveCardIds: Set<string>;
}

/**
 * One column on the board. `useDroppable` makes the column itself a valid
 * drop target for the case where a card is dropped into an EMPTY column
 * (no existing card to drop "next to") — the id is prefixed with
 * "column-" so the board page's onDragEnd can tell "dropped on a column"
 * apart from "dropped on a card" when both ids could otherwise collide.
 */
export function BoardColumn({
  listId,
  title,
  cards,
  members,
  onAddCard,
  onDeleteCard,
  onOpenCard,
  onRenameList,
  onDeleteList,
  canAdd,
  canEdit,
  canDelete,
  pendingMoveCardIds,
}: BoardColumnProps) {
  const { setNodeRef } = useDroppable({ id: `column-${listId}` });
  const [newCardTitle, setNewCardTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [cardTitleError, setCardTitleError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newCardTitle.trim()) {
      setCardTitleError("Card title is required.");
      return;
    }
    onAddCard(listId, newCardTitle);
    setNewCardTitle("");
    setCardTitleError(null);
  }

  return (
    <div className="board-column-snap flex max-h-full w-[85vw] shrink-0 flex-col rounded-xl bg-slate-100/80 p-2.5 sm:w-72">
      <div className="mb-2 flex items-center justify-between gap-1 px-1">
        <EditableTitle
          as="h3"
          value={title}
          onSave={(next) => onRenameList(listId, next)}
          disabled={!canEdit}
          className="text-sm font-semibold text-slate-700"
          inputClassName="w-full rounded-md border border-brand-300 bg-white px-1.5 py-0.5 text-sm font-semibold text-slate-700 outline-none ring-2 ring-brand-100"
        />
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
            {cards.length}
          </span>
          {canDelete && (
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label="Delete list"
              className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className="scrollbar-thin min-h-[20px] flex-1 space-y-2 overflow-y-auto px-0.5"
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <TaskCard
              key={card.id}
              card={card}
              members={members}
              onDelete={onDeleteCard}
              onOpen={onOpenCard}
              canDelete={canDelete}
              isMovePending={pendingMoveCardIds.has(card.id)}
            />
          ))}
        </SortableContext>
      </div>

      {!canAdd ? null : isAdding ? (
        <form onSubmit={handleSubmit} className="mt-2 space-y-1.5">
          <textarea
            autoFocus
            rows={2}
            placeholder="Enter a title for this card..."
            value={newCardTitle}
            onChange={(e) => {
              setNewCardTitle(e.target.value);
              if (cardTitleError) setCardTitleError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
              if (e.key === "Escape") {
                setIsAdding(false);
                setNewCardTitle("");
                setCardTitleError(null);
              }
            }}
            aria-invalid={!!cardTitleError}
            className={`w-full resize-none rounded-lg border bg-white px-2.5 py-2 text-sm shadow-sm outline-none ring-2 ${
              cardTitleError ? "border-red-300 ring-red-100" : "border-brand-300 ring-brand-100"
            }`}
          />
          {cardTitleError && <p className="text-xs text-red-600">{cardTitleError}</p>}
          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewCardTitle("");
                setCardTitleError(null);
              }}
              aria-label="Cancel"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm text-slate-500 hover:bg-slate-200/70"
        >
          <PlusIcon className="h-4 w-4" /> Add a card
        </button>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this list?"
        description={`"${title}" and all ${cards.length} card${cards.length === 1 ? "" : "s"} in it will be permanently deleted.`}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await onDeleteList(listId);
          setConfirmingDelete(false);
        }}
      />
    </div>
  );
}
