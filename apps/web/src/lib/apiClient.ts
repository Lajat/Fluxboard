/**
 * Central API client for talking to the fluxboard backend.
 *
 * Every frontend call to the API should go through `apiFetch` rather than
 * calling `fetch` directly — this is the one place that:
 *   1. Prefixes the API base URL (so components never hardcode it)
 *   2. Attaches the current access token, if one exists
 *   3. Throws a consistent Error (with the backend's message) on any
 *      non-2xx response, so calling code can just `try/catch` instead of
 *      checking `res.ok` everywhere
 *
 * If the API's error shape or auth header scheme ever changes, this is the
 * only file that needs to change.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown; // pass a plain object — apiFetch handles JSON.stringify
  accessToken?: string | null;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { body, accessToken, headers, ...rest } = options;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Backend consistently returns { error: "..." } on failure — surface
    // that message rather than a generic "request failed".
    throw new ApiError(data.error || "Request failed", res.status);
  }

  return data as T;
}
