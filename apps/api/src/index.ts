import "dotenv/config";
import express from "express";
import cors from "cors";
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

const PORT = process.env.PORT || 4000;

const app = express();
app.use(express.json());
app.use(cors());

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

// Socket.io needs the raw http.Server, not the Express app directly, so it
// can upgrade HTTP connections to WebSocket connections.
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.WEB_ORIGIN || "http://localhost:3000" },
});

io.on("connection", (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);

  // A socket starts out anonymous. The client sends its access token here
  // right after connecting — once verified, we join a personal
  // `user:<id>` room, which is how server-initiated events that aren't
  // tied to a board/workspace the user has open (e.g. "you've been
  // removed from a workspace") still reach them.
  socket.on("identify", (accessToken: string) => {
    const userId = verifyAccessToken(accessToken);
    if (!userId) return; // invalid/expired token — socket just stays anonymous
    socket.data.userId = userId;
    socket.join(`user:${userId}`);
  });

  // Clients join a per-board "room" so events only reach people actually
  // looking at that board, not every connected client on the whole app.
  // Membership is verified here using the access token sent alongside the
  // boardId — deliberately NOT relying on a prior "identify" call having
  // already completed, since that's a separate, independently-timed step
  // (the client's auth state and this join call can race on a fresh page
  // load) and silently failing to join would break real-time sync
  // entirely rather than just missing a personal notification.
  socket.on("join-board", async ({ boardId, accessToken }: { boardId: string; accessToken: string }) => {
    const userId = verifyAccessToken(accessToken);
    if (!(await socketCanAccessBoard(userId, boardId))) return;
    socket.join(`board:${boardId}`);
  });

  socket.on("leave-board", (boardId: string) => {
    socket.leave(`board:${boardId}`);
  });

  // Same idea, one level up: the workspace's board-list page joins this
  // room to get live updates when a board is created/renamed/deleted, or
  // when someone is added to or removed from the workspace.
  socket.on(
    "join-workspace",
    async ({ workspaceId, accessToken }: { workspaceId: string; accessToken: string }) => {
      const userId = verifyAccessToken(accessToken);
      if (!(await socketIsWorkspaceMember(userId, workspaceId))) return;
      socket.join(`workspace:${workspaceId}`);
    }
  );

  socket.on("leave-workspace", (workspaceId: string) => {
    socket.leave(`workspace:${workspaceId}`);
  });

  socket.on("disconnect", () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });
});

/** Verifies a JWT access token and returns the userId it encodes, or undefined if invalid/missing. */
function verifyAccessToken(accessToken: string | undefined): string | undefined {
  if (!accessToken) return undefined;
  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) return undefined;
    const decoded = jwt.verify(accessToken, secret) as { userId: string };
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
