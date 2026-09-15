"use client";

import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { TrashIcon, CalendarIcon, TagIcon } from "./ui/icons";
import { LABEL_COLORS, type Card, type LabelColor } from "@fluxboard/shared-types";

interface CardDetailModalProps {
  card: Card | null;
  onClose: () => void;
  onSave: (cardId: string, updates: { title: string; description: string; dueDate: string | null; labels: string[] }) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
}

/** Tailwind classes for each label color swatch — kept as one lookup so
 * every place a label renders (this modal, TaskCard) stays visually
 * consistent. */
export const LABEL_SWATCH: Record<LabelColor, string> = {
  gray: "bg-slate-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  green: "bg-emerald-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

/** Converts an ISO timestamp to the value a <input type="date"> expects. */
function toDateInputValue(iso?: string) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/**
 * Full editor for a single card — opened by clicking a card (not
 * dragging it). Handles title, description, due date, and labels in one
 * place, plus the card's delete action, so TaskCard itself only needs a
 * quick delete affordance for the common case and this modal covers
 * everything else.
 */
export function CardDetailModal({ card, onClose, onSave, onDelete }: CardDetailModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? "");
      setDueDate(toDateInputValue(card.dueDate));
      setLabels(card.labels ?? []);
      setTitleTouched(false);
    }
  }, [card]);

  if (!card) return null;

  function toggleLabel(color: string) {
    setLabels((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
  }

  async function handleSave() {
    setTitleTouched(true);
    if (!card || !title.trim()) return;
    setIsSaving(true);
    try {
      await onSave(card.id, {
        title: title.trim(),
        description: description.trim(),
        dueDate: dueDate || null,
        labels,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Modal open={!!card && !confirmingDelete} onClose={onClose} widthClassName="max-w-xl">
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              aria-invalid={titleTouched && !title.trim()}
              className={`w-full rounded-lg border px-3 py-2 text-lg font-semibold text-slate-900 outline-none focus:ring-2 ${
                titleTouched && !title.trim()
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-slate-200 focus:border-brand-400 focus:ring-brand-100"
              }`}
            />
            {titleTouched && !title.trim() && (
              <p className="mt-1 text-xs text-red-600">Title is required.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Add a more detailed description..."
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <CalendarIcon className="h-3.5 w-3.5" /> Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <TagIcon className="h-3.5 w-3.5" /> Labels
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleLabel(color)}
                    aria-label={`Toggle ${color} label`}
                    title={color}
                    className={`h-6 w-6 rounded-full ${LABEL_SWATCH[color]} transition ${
                      labels.includes(color)
                        ? "ring-2 ring-offset-2 ring-slate-900"
                        : "opacity-40 hover:opacity-70"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <TrashIcon className="h-4 w-4" /> Delete card
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !title.trim()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this card?"
        description={`"${card.title}" will be permanently deleted. This can't be undone.`}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await onDelete(card.id);
          setConfirmingDelete(false);
          onClose();
        }}
      />
    </>
  );
}
