import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { signup, login, refresh, getCurrentUser } from "../controllers/authController";

const router = Router();

// Public — no token required to sign up, log in, or refresh a token.
router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/auth/refresh", refresh);

// Requires a valid access token — this is the simplest possible route to
// sanity-check that requireAuth + a real login are working together.
router.get("/auth/me", requireAuth, getCurrentUser);

export default router;
