import { io, Socket } from "socket.io-client";
import { apiFetch } from "./apiClient";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

let socket: Socket | null = null;

/**
 * Returns a single shared Socket.io connection for the whole app.
 *
 * Deliberately a singleton (not created fresh per component/page) — Next.js
 * can re-render a page's component tree often, and creating a new
 * WebSocket connection on every render would leak connections and cause
 * duplicate event handlers to pile up. Call this once per page (e.g. in a
 * useEffect on mount) and reuse the same socket across the session.
 *
 * The browser requests a short-lived socket ticket through the same-origin
 * API proxy for each connection attempt. This keeps the direct API socket
 * independent from cross-site cookie delivery and refreshes credentials on
 * reconnect without exposing the long-lived access or refresh token.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      withCredentials: true,
      auth: (callback) => {
        void apiFetch<{ ticket: string }>("/auth/socket-ticket", { method: "POST" })
          .then(({ ticket }) => callback({ ticket }))
          .catch((error: unknown) => {
            console.error("[socket] Could not obtain an authentication ticket:", error);
            callback({});
          });
      },
      // Reconnect automatically on drop (e.g. laptop sleep, brief network
      // blip) — the default socket.io-client behavior, made explicit here
      // since it's load-bearing for a real-time board that should recover
      // on its own rather than silently going stale.
      reconnection: true,
    });
    socket.on("connect_error", (error) => {
      console.error("[socket] Connection failed:", error.message);
    });
  }
  return socket;
}

/**
 * Tears down the shared connection entirely — used on logout so a
 * subsequent login (possibly as a different user, on a shared device)
 * starts from a completely clean connection rather than reusing one still
 * sitting in the previous user's personal room.
 */
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
