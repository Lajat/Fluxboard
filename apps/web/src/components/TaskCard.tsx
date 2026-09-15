"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, LabelColor } from "@fluxboard/shared-types";
import { TrashIcon, CalendarIcon } from "./ui/icons";
import { LABEL_SWATCH } from "./CardDetailModal";

interface TaskCardProps {
  card: Card;
  onDelete: (cardId: string) => void;
  onOpen?: (card: Card) => void;
}

function formatDueDate(iso?: string) {
  if (!iso) return null;
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(iso?: string) {
  if (!iso) return false;
  return new Date(iso).getTime() < new Date().setHours(0, 0, 0, 0);
}

/**
 * A single draggable card within a list. useSortable (from dnd-kit) wires
 * up the drag handlers and gives us `transform`/`transition` to animate
 * the card as it's dragged and as other cards shift to make room for it.
 *
 * The whole card body doubles as a click target that opens the full
 * editor (onOpen) — this works alongside dragging because dnd-kit's
 * activationConstraint (set on the sensors in the board page) requires a
 * few pixels of movement / a short hold before a drag "starts", so a
 * simple tap/click is never swallowed as a drag.
 */
export function TaskCard({ card, onDelete, onOpen }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const dueLabel = formatDueDate(card.dueDate);
  const overdue = isOverdue(card.dueDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.(card)}
      // touch-none is essential for mobile drag-and-drop: without it, the
      // browser's own touch-scroll gesture competes with dnd-kit's touch
      // sensor for the same pointer events and the drag never starts
      // cleanly. The TouchSensor's activation delay (see the board page)
      // is what still lets a quick tap open the card instead of starting
      // a drag.
      className="group relative cursor-grab touch-none select-none rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-200 hover:shadow-md active:cursor-grabbing"
    >
      {card.labels && card.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {card.labels.map((color) => (
            <span
              key={color}
              className={`h-2 w-8 rounded-full ${LABEL_SWATCH[color as LabelColor] ?? "bg-slate-300"}`}
            />
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-slate-800">{card.title}</p>
        <button
          // Stop the click/pointerdown from also starting a drag or
          // opening the card modal.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card.id);
          }}
          aria-label="Delete card"
          // Always visible on touch/small screens (no hover state to
          // reveal it there); fades in on hover for desktop pointer users.
          className="shrink-0 rounded-md p-1 text-slate-300 opacity-100 transition hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {card.description && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{card.description}</p>
      )}

      {dueLabel && (
        <div
          className={`mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
            overdue ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
          }`}
        >
          <CalendarIcon className="h-3 w-3" />
          {dueLabel}
        </div>
      )}
    </div>
  );
}
