import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createList,
  listListsForBoard,
  updateList,
  reorderLists,
  deleteList,
} from "../controllers/listController";

const router: Router = Router();

router.use(requireAuth);

router.post("/boards/:boardId/lists", createList);
router.get("/boards/:boardId/lists", listListsForBoard);
// IMPORTANT: the literal "/reorder" route must be registered before the
// "/:listId" route below — Express matches routes in registration order,
// and :listId would otherwise greedily capture the literal string
// "reorder" as if it were a list id, and this route would never be reached.
router.patch("/boards/:boardId/lists/reorder", reorderLists);
router.patch("/boards/:boardId/lists/:listId", updateList);
router.delete("/boards/:boardId/lists/:listId", deleteList);

export default router;
