import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createWorkspace,
  listMyWorkspaces,
  getWorkspace,
  addMember,
} from "../controllers/workspaceController";

const router: Router = Router();

// Every workspace route requires a logged-in user.
router.use(requireAuth);

router.post("/workspaces", createWorkspace);
router.get("/workspaces", listMyWorkspaces);
router.get("/workspaces/:workspaceId", getWorkspace);
router.post("/workspaces/:workspaceId/members", addMember);

export default router;
