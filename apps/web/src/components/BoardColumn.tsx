"use client";

import { useState, FormEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import type { Card } from "@fluxboard/shared-types";

interface BoardColumnProps {
  listId: string;
  title: string;
  cards: Card[];
  onAddCard: (listId: string, title: string) => void;
  onDeleteCard: (cardId: string) => void;
}

/**
 * One column on the board. `useDroppable` makes the column itself a valid
 * drop target for the case where a card is dropped into an EMPTY column
 * (no existing card to drop "next to") — the id is prefixed with
 * "column-" so the board page's onDragEnd can tell "dropped on a column"
 * apart from "dropped on a card" when both ids could otherwise collide.
 */
export function BoardColumn({ listId, title, cards, onAddCard, onDeleteCard }: BoardColumnProps) {
  const { setNodeRef } = useDroppable({ id: `column-${listId}` });
  const [newCardTitle, setNewCardTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newCardTitle.trim()) return;
    onAddCard(listId, newCardTitle);
    setNewCardTitle("");
    setIsAdding(false);
  }

  return (
    <div className="w-72 shrink-0 rounded-lg bg-gray-100 p-3">
      <h3 className="mb-3 px-1 text-sm font-semibold text-gray-700">{title}</h3>

      <div ref={setNodeRef} className="min-h-[20px] space-y-2">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <TaskCard key={card.id} card={card} onDelete={onDeleteCard} />
          ))}
        </SortableContext>
      </div>

      {isAdding ? (
        <form onSubmit={handleSubmit} className="mt-2">
          <input
            autoFocus
            type="text"
            placeholder="Card title"
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            onBlur={() => !newCardTitle && setIsAdding(false)}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
        </form>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="mt-2 w-full rounded-md px-2 py-1 text-left text-sm text-gray-500 hover:bg-gray-200"
        >
          + Add a card
        </button>
      )}
    </div>
  );
}
