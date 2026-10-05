import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createBoard,
  listBoardsForWorkspace,
  getBoard,
  updateBoard,
  deleteBoard,
  listBoardGuests,
  addBoardGuest,
  updateBoardGuestPermissions,
  removeBoardGuest,
} from "../controllers/boardController";

const router: Router = Router();

router.use(requireAuth);

router.post("/workspaces/:workspaceId/boards", createBoard);
router.get("/workspaces/:workspaceId/boards", listBoardsForWorkspace);
router.get("/boards/:boardId", getBoard);
router.patch("/boards/:boardId", updateBoard);
router.delete("/boards/:boardId", deleteBoard);

// Single-board guests — see BoardGuestEntry (models/Board.ts) for why
// these are deliberately separate from the workspace-level member routes
// in workspaceRoutes.ts, not a variant of them.
router.get("/boards/:boardId/guests", listBoardGuests);
router.post("/boards/:boardId/guests", addBoardGuest);
router.patch("/boards/:boardId/guests/:userId", updateBoardGuestPermissions);
router.delete("/boards/:boardId/guests/:userId", removeBoardGuest);

export default router;
