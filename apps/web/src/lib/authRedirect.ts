export function getPostAuthRedirect(search: string): string {
  const redirect = new URLSearchParams(search).get("redirect");

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
