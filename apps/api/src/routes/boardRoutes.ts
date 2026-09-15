import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createBoard,
  listBoardsForWorkspace,
  getBoard,
  updateBoard,
  deleteBoard,
} from "../controllers/boardController";

const router: Router = Router();

router.use(requireAuth);

router.post("/workspaces/:workspaceId/boards", createBoard);
router.get("/workspaces/:workspaceId/boards", listBoardsForWorkspace);
router.get("/boards/:boardId", getBoard);
router.patch("/boards/:boardId", updateBoard);
router.delete("/boards/:boardId", deleteBoard);

export default router;
