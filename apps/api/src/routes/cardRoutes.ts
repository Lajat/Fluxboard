import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createCard,
  listCardsForList,
  updateCard,
  deleteCard,
} from "../controllers/cardController";

const router: Router = Router();

// Every card route requires a logged-in user — applied once here rather
// than repeated in each controller function.
router.use(requireAuth);

router.post("/lists/:listId/cards", createCard);
router.get("/lists/:listId/cards", listCardsForList);
router.patch("/cards/:cardId", updateCard);
router.delete("/cards/:cardId", deleteCard);

export default router;
