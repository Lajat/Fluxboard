import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

let socket: Socket | null = null;
// Remembered so we can re-identify automatically after a reconnect (laptop
// sleep, brief network drop) — the server treats each new connection as
// anonymous until it re-identifies, so without this a dropped/restored
// connection would silently stop receiving personal notifications.
let lastAccessToken: string | null = null;

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

    socket.on("connect", () => {
      if (lastAccessToken) socket!.emit("identify", lastAccessToken);
    });
  }
  return socket;
}

/**
 * Authenticates the shared socket connection as the current user — joins
 * a personal `user:<id>` room server-side so events not tied to any
 * specific board/workspace the user has open right now (e.g. "you were
 * removed from a workspace") still reach them. Safe to call on every
 * render/mount; it's a no-op beyond re-sending the same token.
 */
export function identifySocket(accessToken: string) {
  lastAccessToken = accessToken;
  const s = getSocket();
  if (s.connected) s.emit("identify", accessToken);
  // If not yet connected, the "connect" handler registered above will
  // send it as soon as the connection opens.
}

/**
 * Tears down the shared connection entirely — used on logout so a
 * subsequent login (possibly as a different user, on a shared device)
 * starts from a completely clean, unidentified socket rather than
 * reusing one still sitting in the previous user's personal room.
 */
export function disconnectSocket() {
  lastAccessToken = null;
  socket?.disconnect();
  socket = null;
}
