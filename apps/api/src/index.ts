import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { connectToDatabase } from "./config/database";
import { WorkspaceModel } from "./models/Workspace";
import { BoardModel } from "./models/Board";
import authRoutes from "./routes/authRoutes";
import workspaceRoutes from "./routes/workspaceRoutes";
import boardRoutes from "./routes/boardRoutes";
import listRoutes from "./routes/listRoutes";
import cardRoutes from "./routes/cardRoutes";
import commentRoutes from "./routes/commentRoutes";

const PORT = process.env.PORT || 4000;
const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";

const app = express();
app.use(express.json());
app.use(cookieParser());
// `credentials: true` is required for the browser to actually attach the
// httpOnly auth cookies on cross-origin requests (the frontend and API
// run on different ports/origins in dev, and typically different
// subdomains in production) — and a credentialed request can't use the
// wildcard "*" origin, so this must be a specific, exact origin rather
// than left as the previous no-argument cors() default.
app.use(cors({ origin: WEB_ORIGIN, credentials: true }));

// Registered before any auth-protected router, since those routers apply
// requireAuth unconditionally (router.use with no path matches every
// request that reaches them) — health checks must never accidentally end
// up behind auth just because of route registration order.
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Mounted at root rather than under /api/* — nginx or a load balancer in
// front of this service is what would add an /api prefix if needed later,
// keeping this service's own routing simple.
app.use(authRoutes);
app.use(workspaceRoutes);
app.use(boardRoutes);
app.use(listRoutes);
app.use(cardRoutes);
app.use(commentRoutes);

// Socket.io needs the raw http.Server, not the Express app directly, so it
// can upgrade HTTP connections to WebSocket connections.
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: WEB_ORIGIN, credentials: true },
});

io.on("connection", (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);

  // Identify the connection right away using the accessToken cookie sent
  // with the socket.io handshake (the initial HTTP request Socket.io
  // makes before upgrading to a WebSocket) — the browser attaches it
  // automatically for the same reason it does on any other request to
  // this origin, since the cookie's path ("/") covers this too. This
  // replaces an earlier design where the client had to explicitly emit
  // its access token after connecting: that could only ever work when the
  // token was something JS-readable in the first place (localStorage), and
  // reading it here instead means every socket is identified synchronously
  // at connection time, with no separate step and no race between
  // "connected" and "identified" for the rest of this file to worry about.
  const userId = getUserIdFromHandshake(socket.handshake.headers.cookie);
  if (userId) {
    socket.data.userId = userId;
    socket.join(`user:${userId}`);
  }

  // Clients join a per-board "room" so events only reach people actually
  // looking at that board, not every connected client on the whole app.
  // Membership is checked using socket.data.userId set above — if the
  // connection wasn't identified (no valid cookie at handshake time), this
  // silently declines to join rather than trusting an unauthenticated
  // socket with a bare boardId.
  socket.on("join-board", async (boardId: string) => {
    if (!(await socketCanAccessBoard(socket.data.userId, boardId))) return;
    socket.join(`board:${boardId}`);
  });

  socket.on("leave-board", (boardId: string) => {
    socket.leave(`board:${boardId}`);
  });

  // Same idea, one level up: the workspace's board-list page joins this
  // room to get live updates when a board is created/renamed/deleted, or
  // when someone is added to or removed from the workspace.
  socket.on("join-workspace", async (workspaceId: string) => {
    if (!(await socketIsWorkspaceMember(socket.data.userId, workspaceId))) return;
    socket.join(`workspace:${workspaceId}`);
  });

  socket.on("leave-workspace", (workspaceId: string) => {
    socket.leave(`workspace:${workspaceId}`);
  });

  socket.on("disconnect", () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });
});

/**
 * Extracts and verifies the accessToken cookie from a raw `Cookie` header
 * string (the shape socket.handshake.headers.cookie comes in as — unlike
 * Express requests, Socket.io's handshake object isn't run through
 * cookie-parser, so this small manual parse stands in for that). Returns
 * the userId it encodes, or undefined if the cookie is missing, malformed,
 * or the token itself is invalid/expired.
 */
function getUserIdFromHandshake(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;

  const accessToken = cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith("accessToken="))
    ?.slice("accessToken=".length);

  if (!accessToken) return undefined;

  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) return undefined;
    const decoded = jwt.verify(decodeURIComponent(accessToken), secret) as { userId: string };
    return decoded.userId;
  } catch {
    return undefined;
  }
}

/** Whether the given (already-identified) user is a member of a workspace. */
async function socketIsWorkspaceMember(userId: string | undefined, workspaceId: string) {
  if (!userId) return false;
  try {
    const workspace = await WorkspaceModel.findById(workspaceId);
    return !!workspace && workspace.memberIds.some((id) => id.toString() === userId);
  } catch {
    return false; // malformed workspaceId, etc. — fail closed
  }
}

/** Whether the given (already-identified) user can access a board, via its workspace. */
async function socketCanAccessBoard(userId: string | undefined, boardId: string) {
  if (!userId) return false;
  try {
    const board = await BoardModel.findById(boardId);
    if (!board) return false;
    return socketIsWorkspaceMember(userId, board.workspaceId.toString());
  } catch {
    return false;
  }
}

// Stored on the Express app so REST controllers (which don't otherwise
// have access to the socket server) can reach it via req.app.get("io") to
// broadcast an event after a mutation — e.g. cardController emits
// CARD_MOVED after persisting a drag-and-drop move to the database.
app.set("io", io);

connectToDatabase()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`[api] listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[api] failed to start:", err.message);
    process.exit(1);
  });
