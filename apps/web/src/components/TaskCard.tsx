"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "@fluxboard/shared-types";

interface TaskCardProps {
  card: Card;
  onDelete: (cardId: string) => void;
}

/**
 * A single draggable card within a list. useSortable (from dnd-kit) wires
 * up the drag handlers and gives us `transform`/`transition` to animate
 * the card as it's dragged and as other cards shift to make room for it.
 */
export function TaskCard({ card, onDelete }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group cursor-grab rounded-md border border-gray-200 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-gray-800">{card.title}</p>
        <button
          // Stop the click from also starting a drag / bubbling to the card.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(card.id)}
          className="text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
          aria-label="Delete card"
        >
          ×
        </button>
      </div>
    </div>
  );
}
