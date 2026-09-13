import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { connectToDatabase } from "./config/database";
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

  socket.on("disconnect", () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });

  // Real-time event handlers (card:moved, comment:added, etc.) get
  // registered here as the app grows — kept minimal for now since this is
  // an early scaffold; see packages/shared-types for the event names these
  // handlers will use once built.
});

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
