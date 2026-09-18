"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { disconnectSocket, getSocket } from "@/lib/socket";
import { useToast } from "@/components/ui/Toast";
import type { User } from "@fluxboard/shared-types";
import { SocketEvents, type AccessRevokedPayload } from "@fluxboard/shared-types";

interface AuthContextValue {
  user: User | null;
  /**
   * No longer an actual JWT — the real access token lives in an httpOnly
   * cookie the frontend can never read. This is now just a truthy/falsy
   * "is there an authenticated session right now" flag, kept under the
   * same name and shape so the many `if (!accessToken) return` guards
   * scattered across the app (gating API calls and socket joins on "are we
   * logged in yet") keep working unchanged. Nothing anywhere reads this
   * value's actual contents, only its truthiness.
   */
  accessToken: string | null;
  /** True while the initial "am I already logged in?" check on page load is running. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_FLAG = "authenticated"; // sentinel value — see the accessToken doc comment above

/**
 * Wraps the whole app (added in layout.tsx) so any component can call
 * `useAuth()` to read the current user or trigger login/signup/logout,
 * without prop-drilling auth state through every page.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load, just ask the API who we are — the browser attaches the
  // httpOnly accessToken cookie automatically if one exists (see
  // apiClient's `credentials: "include"`), so there's nothing to read out
  // of localStorage first the way there used to be. A 401 here just means
  // "not logged in", not an error to report — the person lands on /login
  // the same as anyone else with no session.
  useEffect(() => {
    apiFetch<User>("/auth/me")
      .then((fetchedUser) => {
        setUser(fetchedUser);
        setAccessToken(SESSION_FLAG);
      })
      .catch(() => {
        // Not logged in (or the one-time refresh apiFetch already
        // attempted internally also failed) — nothing to clean up, since
        // there's no local token storage left to clear.
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Connects the shared socket once we know we're authenticated. No
  // separate "identify" call is needed — the socket.io handshake carries
  // the same httpOnly cookie automatically (see lib/socket.ts), so simply
  // having an open connection at all is sufficient once accessToken is
  // truthy.
  useEffect(() => {
    if (accessToken) getSocket();
  }, [accessToken]);

  // The one truly global real-time listener in the app: no matter which
  // page someone is on — the workspaces grid, a specific workspace, or
  // deep inside a board — if the owner removes them from a workspace,
  // this fires immediately. Redirecting unconditionally to /workspaces is
  // deliberately simple: it's always a safe landing spot, and figuring
  // out "was the page they were on actually inside the affected
  // workspace" isn't worth the complexity for what's fundamentally a rare
  // event.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    function handleAccessRevoked(payload: AccessRevokedPayload) {
      showToast(`You were removed from "${payload.workspaceName}"`, "error");
      router.replace("/workspaces");
    }

    socket.on(SocketEvents.ACCESS_REVOKED, handleAccessRevoked);
    return () => {
      socket.off(SocketEvents.ACCESS_REVOKED, handleAccessRevoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /**
   * Where to send the user right after a successful login/signup. Normally
   * that's just /workspaces, but if they arrived here via a link that
   * needs them authenticated first — right now, only the invite-link flow
   * does this (?redirect=/invite/<token>) — send them back to finish what
   * they came here to do instead of dropping them on the generic
   * workspaces list.
   */
  function getPostAuthRedirect(): string {
    if (typeof window === "undefined") return "/workspaces";
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    // Only ever redirect to a same-app relative path, and never back into
    // the auth pages themselves — both guard against a malformed or
    // tampered redirect param sending the user somewhere unintended or
    // into a login<->redirect loop.
    if (
      redirect &&
      redirect.startsWith("/") &&
      !redirect.startsWith("//") &&
      !redirect.startsWith("/login") &&
      !redirect.startsWith("/signup")
    ) {
      return redirect;
    }
    return "/workspaces";
  }

  async function login(email: string, password: string) {
    // The response body only contains the user profile now — both tokens
    // are set as httpOnly cookies directly by the server's Set-Cookie
    // headers, never present in JSON the frontend could read.
    const result = await apiFetch<{ user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(result.user);
    setAccessToken(SESSION_FLAG);
    router.push(getPostAuthRedirect());
  }

  async function signup(email: string, password: string, displayName: string) {
    const result = await apiFetch<{ user: User }>("/auth/signup", {
      method: "POST",
      body: { email, password, displayName },
    });
    setUser(result.user);
    setAccessToken(SESSION_FLAG);
    router.push(getPostAuthRedirect());
  }

  async function logout() {
    try {
      // Clears both cookies server-side — unlike localStorage, an httpOnly
      // cookie can't just be deleted client-side, so this request is what
      // actually ends the session rather than merely hiding it from this
      // one tab.
      await apiFetch("/auth/logout", { method: "POST" });
    } catch (err) {
      // Even if this call fails (e.g. the API is briefly unreachable),
      // still proceed with clearing local state below — a stuck "can't
      // log out" experience would be worse than a cookie that outlives
      // this particular attempt and simply expires on its own later.
    }
    setUser(null);
    setAccessToken(null);
    disconnectSocket();
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Convenience hook — throws early if used outside <AuthProvider>, rather than silently returning null. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
