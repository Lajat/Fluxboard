import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import {
  signup,
  login,
  refresh,
  logout,
  getCurrentUser,
  forgotPassword,
  resetPassword,
} from "../controllers/authController";

const router = Router();

// Public — no access token required to sign up, log in, or refresh.
// (refresh instead requires the separate, narrowly-scoped refreshToken
// cookie — see authController.refresh.)
router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/auth/refresh", refresh);
router.post("/auth/logout", logout);
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/reset-password", resetPassword);

// Requires a valid access token — this is the simplest possible route to
// sanity-check that requireAuth + a real login are working together.
router.get("/auth/me", requireAuth, getCurrentUser);

export default router;
