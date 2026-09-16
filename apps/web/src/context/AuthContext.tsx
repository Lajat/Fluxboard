"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { identifySocket, disconnectSocket, getSocket } from "@/lib/socket";
import { useToast } from "@/components/ui/Toast";
import type { User } from "@fluxboard/shared-types";
import { SocketEvents, type AccessRevokedPayload } from "@fluxboard/shared-types";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  /** True while the initial "am I already logged in?" check on page load is running. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "fluxboard_auth_tokens";

/**
 * Reads persisted tokens from localStorage. Wrapped in try/catch because
 * localStorage can throw in some environments (private browsing in older
 * Safari, SSR where `window` doesn't exist yet) — a missing/corrupt value
 * should just mean "not logged in", not crash the app.
 */
function loadStoredTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeTokens(tokens: AuthTokens | null) {
  if (typeof window === "undefined") return;
  if (tokens) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

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

  // On first load, check localStorage for a previously saved token and
  // verify it's still valid by fetching the current user. This is what
  // keeps someone logged in across a page refresh.
  useEffect(() => {
    const stored = loadStoredTokens();
    if (!stored) {
      setIsLoading(false);
      return;
    }

    apiFetch<User>("/auth/me", { accessToken: stored.accessToken })
      .then((fetchedUser) => {
        setUser(fetchedUser);
        setAccessToken(stored.accessToken);
      })
      .catch(() => {
        // Stored token is expired/invalid — clear it rather than leaving
        // stale, unusable tokens sitting in localStorage.
        storeTokens(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Whenever we have a valid access token — on initial load, after login,
  // after signup — (re)identify the shared socket connection so personal
  // notifications (like "you were removed from a workspace") reach this
  // client even when it isn't currently looking at that workspace/board.
  useEffect(() => {
    if (accessToken) identifySocket(accessToken);
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
    if (redirect && redirect.startsWith("/") && !redirect.startsWith("//") && !redirect.startsWith("/login") && !redirect.startsWith("/signup")) {
      return redirect;
    }
    return "/workspaces";
  }

  async function login(email: string, password: string) {
    const result = await apiFetch<{ user: User; accessToken: string; refreshToken: string }>(
      "/auth/login",
      { method: "POST", body: { email, password } }
    );
    setUser(result.user);
    setAccessToken(result.accessToken);
    storeTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    router.push(getPostAuthRedirect());
  }

  async function signup(email: string, password: string, displayName: string) {
    const result = await apiFetch<{ user: User; accessToken: string; refreshToken: string }>(
      "/auth/signup",
      { method: "POST", body: { email, password, displayName } }
    );
    setUser(result.user);
    setAccessToken(result.accessToken);
    storeTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    router.push(getPostAuthRedirect());
  }

  function logout() {
    setUser(null);
    setAccessToken(null);
    storeTokens(null);
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
