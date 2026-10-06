import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notificationController";

const router: Router = Router();

router.use(requireAuth);

router.get("/notifications", listNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.patch("/notifications/:notificationId/read", markNotificationRead);

export default router;
