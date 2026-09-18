import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { listCommentsForCard, createComment } from "../controllers/commentController";

const router: Router = Router();

router.use(requireAuth);

router.get("/cards/:cardId/comments", listCommentsForCard);
router.post("/cards/:cardId/comments", createComment);

export default router;
