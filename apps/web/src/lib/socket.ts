import { io, Socket } from "socket.io-client";

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
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      // Reconnect automatically on drop (e.g. laptop sleep, brief network
      // blip) — the default socket.io-client behavior, made explicit here
      // since it's load-bearing for a real-time board that should recover
      // on its own rather than silently going stale.
      reconnection: true,
    });
  }
  return socket;
}
