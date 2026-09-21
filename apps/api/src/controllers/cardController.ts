import { Request, Response } from "express";
import { Types } from "mongoose";
import { CardModel } from "../models/Card";
import { ListModel } from "../models/List";
import { BoardModel } from "../models/Board";
import type { Card } from "@fluxboard/shared-types";
import { SocketEvents } from "@fluxboard/shared-types";
import { getMemberPermissions, isWorkspaceMember, loadWorkspaceForList } from "../lib/permissions";
import { generateKeyPrefix } from "../lib/taskId";

/**
 * Rejects a dueDate before today. Stored dates are still plain UTC ISO
 * timestamps (see the model) — this compares by calendar date only, not
 * exact time, so "today" is valid regardless of what hour it currently is
 * anywhere. Enforced server-side because the frontend's <input min="..">
 * only stops the native date picker UI; a direct API call bypasses it
 * entirely without this. Returns an error string, or null if valid.
 */
function validateDueDate(dueDate: unknown): string | null {
  if (!dueDate) return null; // clearing/omitting a due date is always fine
  const parsed = new Date(dueDate as string);
  if (isNaN(parsed.getTime())) return "dueDate must be a valid date";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (parsed < todayStart) return "dueDate cannot be in the past";
  return null;
}

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
    dueDate: doc.dueDate?.toISOString(),
    labels: doc.labels ?? [],
    priority: doc.priority,
    taskId: doc.taskId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * POST /lists/:listId/cards
 * Creates a new card at the end of the given list's cardOrder. The caller
 * must be a workspace member with the "add" permission.
 */
export async function createCard(req: Request, res: Response) {
  const { listId } = req.params;
  const { title, description, dueDate, labels, priority, assigneeId } = req.body;

  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  const dueDateError = validateDueDate(dueDate);
  if (dueDateError) {
    return res.status(400).json({ error: dueDateError });
  }

  const list = await ListModel.findById(listId);
  if (!list) {
    return res.status(404).json({ error: "list not found" });
  }

  const workspace = await loadWorkspaceForList(listId);
  const permissions = workspace ? getMemberPermissions(workspace, req.userId!) : null;
  if (!permissions) {
    return res.status(404).json({ error: "list not found" });
  }
  if (!permissions.canAdd) {
    return res.status(403).json({ error: "you don't have permission to add cards to this board" });
  }

  // Hand out this card's human-readable task ID (e.g. "BT-7") by
  // atomically incrementing the board's card counter. $inc is used
  // (rather than read-then-write) specifically so two cards created on
  // the same board at nearly the same moment can never be handed the same
  // number — MongoDB guarantees the increment itself is atomic even
  // though this whole request handler isn't.
  const board = await BoardModel.findById(list.boardId);
  if (!board) {
    return res.status(404).json({ error: "board not found" });
  }
  // Boards created before this feature existed have no keyPrefix yet —
  // backfill it lazily here, the same pattern as Workspace.inviteToken.
  if (!board.keyPrefix) {
    board.keyPrefix = generateKeyPrefix(board.title);
  }
  board.cardCounter += 1;
  await board.save();
  const taskId = `${board.keyPrefix}-${board.cardCounter}`;

  const card = await CardModel.create({
    listId,
    title,
    description,
    dueDate,
    labels,
    priority: priority || undefined,
    assigneeId: assigneeId || undefined,
    taskId,
  });

  // Keep the list's cardOrder in sync — this array is the source of truth
  // for on-screen ordering, so every card creation/deletion must update it.
  list.cardOrder.push(card._id);
  await list.save();

  const cardResponse = toCardResponse(card);

  // Broadcast to everyone else looking at this board (see index.ts for
  // where req.app "io" is set, and List.boardId for how we know which
  // board this list belongs to). The creating client already has this
  // card in its own state from the HTTP response below, so this event is
  // really for OTHER open tabs/browsers.
  req.app.get("io").to(`board:${list.boardId}`).emit(SocketEvents.CARD_CREATED, cardResponse);

  res.status(201).json(cardResponse);
}

/**
 * GET /lists/:listId/cards
 * Returns all cards in a list, in cardOrder (not insertion order).
 * Requires plain membership — previously this had no check at all either.
 */
export async function listCardsForList(req: Request, res: Response) {
  const { listId } = req.params;

  const workspace = await loadWorkspaceForList(listId);
  if (!workspace || !isWorkspaceMember(workspace, req.userId!)) {
    return res.status(404).json({ error: "list not found" });
  }

  const list = await ListModel.findById(listId).populate("cardOrder");
  if (!list) {
    return res.status(404).json({ error: "list not found" });
  }

  const cards = (list.cardOrder as any[]).map(toCardResponse);
  res.json({ items: cards });
}

/**
 * PATCH /cards/:cardId
 * Updates a card's title/description/dueDate/labels/priority/assignee.
 * Requires "edit" permission. Does not handle moving a card between lists
 * — that's a separate endpoint (moveCard) because it also needs to update
 * two lists' cardOrder arrays, not just the card itself.
 */
export async function updateCard(req: Request, res: Response) {
  const { cardId } = req.params;
  const { title, description, dueDate, labels, priority, assigneeId } = req.body;

  const dueDateError = validateDueDate(dueDate);
  if (dueDateError) {
    return res.status(400).json({ error: dueDateError });
  }

  const existingCard = await CardModel.findById(cardId);
  if (!existingCard) {
    return res.status(404).json({ error: "card not found" });
  }

  const workspace = await loadWorkspaceForList(existingCard.listId.toString());
  const permissions = workspace ? getMemberPermissions(workspace, req.userId!) : null;
  if (!permissions) {
    return res.status(404).json({ error: "card not found" });
  }
  if (!permissions.canEdit) {
    return res.status(403).json({ error: "you don't have permission to edit this card" });
  }

  const card = await CardModel.findByIdAndUpdate(
    cardId,
    {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      // Allow explicitly clearing dueDate/priority/assignee by passing
      // null — `|| undefined` turns that null (or an empty string) into
      // "unset this field" rather than storing a null/empty value.
      ...(dueDate !== undefined && { dueDate: dueDate || undefined }),
      ...(labels !== undefined && { labels }),
      ...(priority !== undefined && { priority: priority || undefined }),
      ...(assigneeId !== undefined && { assigneeId: assigneeId || undefined }),
    },
    { new: true } // return the updated document, not the pre-update one
  );

  if (!card) {
    return res.status(404).json({ error: "card not found" });
  }

  const cardResponse = toCardResponse(card);

  // Look up the list to find which board's room to broadcast to — the
  // card itself only knows its listId, not the boardId.
  const list = await ListModel.findById(card.listId);
  if (list) {
    req.app.get("io").to(`board:${list.boardId}`).emit(SocketEvents.CARD_UPDATED, cardResponse);
  }

  res.json(cardResponse);
}

/**
 * DELETE /cards/:cardId
 * Deletes a card and removes its id from its list's cardOrder. Requires
 * "delete" permission.
 */
export async function deleteCard(req: Request, res: Response) {
  const { cardId } = req.params;

  const existingCard = await CardModel.findById(cardId);
  if (!existingCard) {
    return res.status(404).json({ error: "card not found" });
  }

  const workspace = await loadWorkspaceForList(existingCard.listId.toString());
  const permissions = workspace ? getMemberPermissions(workspace, req.userId!) : null;
  if (!permissions) {
    return res.status(404).json({ error: "card not found" });
  }
  if (!permissions.canDelete) {
    return res.status(403).json({ error: "you don't have permission to delete this card" });
  }

  const card = await CardModel.findByIdAndDelete(cardId);
  if (!card) {
    return res.status(404).json({ error: "card not found" });
  }

  const list = await ListModel.findByIdAndUpdate(card.listId, {
    $pull: { cardOrder: card._id },
  });

  const cardResponse = toCardResponse(card);

  if (list) {
    req.app.get("io").to(`board:${list.boardId}`).emit(SocketEvents.CARD_DELETED, {
      cardId: cardResponse.id,
      listId: cardResponse.listId,
    });
  }

  res.json({ deleted: cardResponse });
}

/**
 * PATCH /cards/:cardId/move
 * Moves a card to a (possibly different) list, at a specific index.
 * This is the endpoint the frontend calls after a drag-and-drop drop,
 * whether the card moved within one list or across two different lists —
 * both cases update cardOrder on one or two ListModel documents. Treated
 * as an "edit" action, same permission level as changing a card's fields.
 */
export async function moveCard(req: Request, res: Response) {
  const { cardId } = req.params;
  const { toListId, newIndex } = req.body;

  if (!toListId || !Number.isInteger(newIndex) || newIndex < 0) {
    return res.status(400).json({ error: "toListId and newIndex are required" });
  }

  const card = await CardModel.findById(cardId);
  if (!card) {
    return res.status(404).json({ error: "card not found" });
  }

  const fromListId = card.listId.toString();

  const workspace = await loadWorkspaceForList(fromListId);
  const permissions = workspace ? getMemberPermissions(workspace, req.userId!) : null;
  if (!permissions) {
    return res.status(404).json({ error: "card not found" });
  }
  if (!permissions.canEdit) {
    return res.status(403).json({ error: "you don't have permission to move this card" });
  }

  const sourceList = await ListModel.findById(fromListId);
  const destinationList = await ListModel.findById(toListId);
  if (!destinationList) {
    return res.status(404).json({ error: "destination list not found" });
  }

  // A card can only move between lists on the SAME board — the frontend
  // never offers a way to drag a card onto a different board's list, and
  // without this check a crafted request could move a card into a board
  // (even a different workspace's board) the destination list happens to
  // belong to, effectively exfiltrating it out of its original workspace.
  if (!sourceList || sourceList.boardId.toString() !== destinationList.boardId.toString()) {
    return res.status(400).json({ error: "a card can only move between lists on the same board" });
  }

  // Remove every existing occurrence, then insert one copy in the destination
  // within the same update pipeline so overlapping moves cannot duplicate it.
  const cardObjectId = new Types.ObjectId(cardId);
  const destinationObjectId = new Types.ObjectId(toListId);
  await ListModel.updateMany(
    { boardId: destinationList.boardId },
    [
      {
        $set: {
          cardOrder: {
            $let: {
              vars: {
                remaining: {
                  $filter: {
                    input: "$cardOrder",
                    as: "cardId",
                    cond: { $ne: ["$$cardId", cardObjectId] },
                  },
                },
              },
              in: {
                $cond: [
                  { $eq: ["$_id", destinationObjectId] },
                  {
                    $concatArrays: [
                      newIndex === 0 ? [] : { $slice: ["$$remaining", 0, newIndex] },
                      [cardObjectId],
                      { $slice: ["$$remaining", newIndex] },
                    ],
                  },
                  "$$remaining",
                ],
              },
            },
          },
        },
      },
    ]
  );

  // Update the card's own listId to match — cardOrder arrays are the
  // source of truth for ordering, but listId is what every other query
  // (e.g. listCardsForList) filters by, so both must stay in sync.
  const updatedCard = await CardModel.findByIdAndUpdate(cardId, { listId: toListId }, { new: true });

  req.app.get("io").to(`board:${destinationList.boardId}`).emit(SocketEvents.CARD_MOVED, {
    cardId: card._id.toString(),
    fromListId,
    toListId,
    newIndex,
    movedBy: req.userId,
  });

  res.json(toCardResponse(updatedCard));
}
