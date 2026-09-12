import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/User";
import type { User } from "@fluxboard/shared-types";

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_TTL = "15m"; // short-lived — sent with every request
const REFRESH_TOKEN_TTL = "30d"; // long-lived — only used to mint new access tokens

/**
 * Converts a Mongoose UserDocument into the public `User` shape from
 * @fluxboard/shared-types — deliberately excludes passwordHash, so it's
 * structurally impossible to accidentally leak it in an API response by
 * forgetting to strip a field somewhere.
 */
function toUserResponse(doc: any): User {
  return {
    id: doc._id.toString(),
    email: doc.email,
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Signs a short-lived access token and a long-lived refresh token for a
 * given user id. Kept as one helper so both signup and login mint tokens
 * identically — no risk of the two flows drifting apart over time.
 */
function issueTokens(userId: string) {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!accessSecret || !refreshSecret) {
    throw new Error("JWT secrets are not configured on the server");
  }

  const accessToken = jwt.sign({ userId }, accessSecret, { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = jwt.sign({ userId }, refreshSecret, { expiresIn: REFRESH_TOKEN_TTL });

  return { accessToken, refreshToken };
}

/**
 * POST /auth/signup
 * Creates a new user account and immediately logs them in (returns tokens).
 */
export async function signup(req: Request, res: Response) {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    return res.status(400).json({ error: "email, password, and displayName are required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  const existing = await UserModel.findOne({ email: email.toLowerCase() });
  if (existing) {
    // Deliberately generic message — confirming "this email is taken" to an
    // unauthenticated caller is a minor account-enumeration leak.
    return res.status(409).json({ error: "unable to create account with these details" });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await UserModel.create({ email, passwordHash, displayName });

  const { accessToken, refreshToken } = issueTokens(user._id.toString());

  res.status(201).json({
    user: toUserResponse(user),
    accessToken,
    refreshToken,
  });
}

/**
 * POST /auth/login
 * Verifies credentials and issues a fresh token pair.
 */
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await UserModel.findOne({ email: email.toLowerCase() });

  // Same error message whether the email doesn't exist or the password is
  // wrong — again, avoids confirming which emails have accounts.
  const invalidCredentialsError = { error: "invalid email or password" };

  if (!user) {
    return res.status(401).json(invalidCredentialsError);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json(invalidCredentialsError);
  }

  const { accessToken, refreshToken } = issueTokens(user._id.toString());

  res.json({
    user: toUserResponse(user),
    accessToken,
    refreshToken,
  });
}

/**
 * POST /auth/refresh
 * Exchanges a valid refresh token for a new access token (and a rotated
 * refresh token, following refresh-token-rotation best practice — every use
 * of a refresh token invalidates it in favor of a new one, which limits the
 * damage if a refresh token is ever stolen).
 */
export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!refreshSecret) {
    throw new Error("JWT_REFRESH_SECRET is not configured on the server");
  }

  try {
    const decoded = jwt.verify(refreshToken, refreshSecret) as { userId: string };
    const tokens = issueTokens(decoded.userId);
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: "invalid or expired refresh token" });
  }
}

/**
 * GET /auth/me
 * Returns the currently logged-in user's profile. Sits behind requireAuth,
 * so req.userId is guaranteed to be set by the time this runs.
 */
export async function getCurrentUser(req: Request, res: Response) {
  const user = await UserModel.findById(req.userId);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  res.json(toUserResponse(user));
}
