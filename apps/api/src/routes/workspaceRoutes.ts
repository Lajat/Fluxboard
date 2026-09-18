import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  createWorkspace,
  listMyWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listMembers,
  addMember,
  removeMember,
  updateMemberPermissions,
  getInviteLink,
  regenerateInviteLink,
  joinViaInviteLink,
} from "../controllers/workspaceController";

const router: Router = Router();

// Every workspace route requires a logged-in user.
router.use(requireAuth);

router.post("/workspaces", createWorkspace);
router.get("/workspaces", listMyWorkspaces);
router.get("/workspaces/:workspaceId", getWorkspace);
router.patch("/workspaces/:workspaceId", updateWorkspace);
router.delete("/workspaces/:workspaceId", deleteWorkspace);
router.get("/workspaces/:workspaceId/members", listMembers);
router.post("/workspaces/:workspaceId/members", addMember);
router.delete("/workspaces/:workspaceId/members/:userId", removeMember);
router.patch("/workspaces/:workspaceId/members/:userId/permissions", updateMemberPermissions);
router.get("/workspaces/:workspaceId/invite-link", getInviteLink);
router.post("/workspaces/:workspaceId/invite-link/regenerate", regenerateInviteLink);
// Not workspace-scoped by id in the URL (the token itself identifies the
// workspace) — lives here anyway since it's part of the same invite
// feature, rather than in its own single-route file.
router.post("/invites/:token/join", joinViaInviteLink);

export default router;
