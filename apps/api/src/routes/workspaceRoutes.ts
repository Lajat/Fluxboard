import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createWorkspace,
  listMyWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  addMember,
} from "../controllers/workspaceController";

const router: Router = Router();

// Every workspace route requires a logged-in user.
router.use(requireAuth);

router.post("/workspaces", createWorkspace);
router.get("/workspaces", listMyWorkspaces);
router.get("/workspaces/:workspaceId", getWorkspace);
router.patch("/workspaces/:workspaceId", updateWorkspace);
router.delete("/workspaces/:workspaceId", deleteWorkspace);
router.post("/workspaces/:workspaceId/members", addMember);

export default router;
