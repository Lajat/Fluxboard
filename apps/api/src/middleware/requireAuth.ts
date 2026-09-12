import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * Augments Express's Request type so `req.userId` is recognized by
 * TypeScript everywhere downstream, instead of every controller having to
 * cast `req` or use `any`.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Verifies the JWT access token in the Authorization header and attaches
 * the decoded user id to `req.userId`. Any route that needs to know "who
 * is making this request" should sit behind this middleware.
 *
 * Expects: `Authorization: Bearer <token>`
 * On failure: responds 401 and does NOT call next() — the request stops here.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      // A misconfigured server is a 500, not a 401 — the client did nothing wrong.
      throw new Error("JWT_ACCESS_SECRET is not configured on the server");
    }
    const decoded = jwt.verify(token, secret) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
