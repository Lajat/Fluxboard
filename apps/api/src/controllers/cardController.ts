import { Request, Response } from "express";
import { CardModel } from "../models/Card";
import { ListModel } from "../models/List";
import type { Card } from "@fluxboard/shared-types";

/**
 * Converts a Mongoose CardDocument into the plain `Card` shape defined in
 * @fluxboard/shared-types — the shape actually sent over the wire to the
 * frontend. Keeping this conversion in one function means there's a single
 * place to update if the wire format needs to change, rather than repeating
 * the same `{ id: doc._id.toString(), ... }` mapping in every handler below.
 */
function toCardResponse(doc: any): Card {
  return {
    id: doc._id.toString(),
    listId: doc.listId.toString(),
    title: doc.title,
    description: doc.description,
    assigneeId: doc.assigneeId?.toString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * POST /lists/:listId/cards
 * Creates a new card at the end of the given list's cardOrder.
 */
export async function createCard(req: Request, res: Response) {
  const { listId } = req.params;
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  const list = await ListModel.findById(listId);
  if (!list) {
    return res.status(404).json({ error: "list not found" });
  }

  const card = await CardModel.create({ listId, title, description });

  // Keep the list's cardOrder in sync — this array is the source of truth
  // for on-screen ordering, so every card creation/deletion must update it.
  list.cardOrder.push(card._id);
  await list.save();

  res.status(201).json(toCardResponse(card));
}

/**
 * GET /lists/:listId/cards
 * Returns all cards in a list, in cardOrder (not insertion order).
 */
export async function listCardsForList(req: Request, res: Response) {
  const { listId } = req.params;

  const list = await ListModel.findById(listId).populate("cardOrder");
  if (!list) {
    return res.status(404).json({ error: "list not found" });
  }

  const cards = (list.cardOrder as any[]).map(toCardResponse);
  res.json({ items: cards });
}

/**
 * PATCH /cards/:cardId
 * Updates a card's title/description. Does not handle moving a card
 * between lists — that's a separate endpoint (moveCard) because it also
 * needs to update two lists' cardOrder arrays, not just the card itself.
 */
export async function updateCard(req: Request, res: Response) {
  const { cardId } = req.params;
  const { title, description } = req.body;

  const card = await CardModel.findByIdAndUpdate(
    cardId,
    { ...(title !== undefined && { title }), ...(description !== undefined && { description }) },
    { new: true } // return the updated document, not the pre-update one
  );

  if (!card) {
    return res.status(404).json({ error: "card not found" });
  }

  res.json(toCardResponse(card));
}

/**
 * DELETE /cards/:cardId
 * Deletes a card and removes its id from its list's cardOrder.
 */
export async function deleteCard(req: Request, res: Response) {
  const { cardId } = req.params;

  const card = await CardModel.findByIdAndDelete(cardId);
  if (!card) {
    return res.status(404).json({ error: "card not found" });
  }

  await ListModel.findByIdAndUpdate(card.listId, {
    $pull: { cardOrder: card._id },
  });

  res.json({ deleted: toCardResponse(card) });
}

/**
 * PATCH /cards/:cardId/move
 * Moves a card to a (possibly different) list, at a specific index.
 * This is the endpoint the frontend calls after a drag-and-drop drop,
 * whether the card moved within one list or across two different lists —
 * both cases update cardOrder on one or two ListModel documents.
 */
export async function moveCard(req: Request, res: Response) {
  const { cardId } = req.params;
  const { toListId, newIndex } = req.body;

  if (!toListId || typeof newIndex !== "number") {
    return res.status(400).json({ error: "toListId and newIndex are required" });
  }

  const card = await CardModel.findById(cardId);
  if (!card) {
    return res.status(404).json({ error: "card not found" });
  }

  const fromListId = card.listId.toString();

  // Remove the card from its old list's cardOrder — a no-op $pull if the
  // card is moving within the same list it's already in.
  await ListModel.findByIdAndUpdate(fromListId, { $pull: { cardOrder: card._id } });

  // Insert into the destination list's cardOrder at the requested index.
  const destinationList = await ListModel.findById(toListId);
  if (!destinationList) {
    return res.status(404).json({ error: "destination list not found" });
  }
  destinationList.cardOrder.splice(newIndex, 0, card._id);
  await destinationList.save();

  // Update the card's own listId to match — cardOrder arrays are the
  // source of truth for ordering, but listId is what every other query
  // (e.g. listCardsForList) filters by, so both must stay in sync.
  card.listId = toListId;
  await card.save();

  res.json(toCardResponse(card));
}

