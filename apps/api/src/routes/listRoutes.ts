import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createList,
  listListsForBoard,
  reorderLists,
  deleteList,
} from "../controllers/listController";

const router: Router = Router();

router.use(requireAuth);

router.post("/boards/:boardId/lists", createList);
router.get("/boards/:boardId/lists", listListsForBoard);
router.patch("/boards/:boardId/lists/reorder", reorderLists);
router.delete("/boards/:boardId/lists/:listId", deleteList);

export default router;
