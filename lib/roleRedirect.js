/**
 * Maps a role to its dashboard path. Shared between the auth callback route
 * and the demo-mode login flow so the two redirect rules can't drift.
 * Client-safe: no server-only imports.
 *
 * @param {"buyer" | "vendor" | null | undefined} role
 * @returns {string}
 */
export function getRedirectPathForRole(role) {
  if (role === "buyer") return "/buyer";
  if (role === "vendor") return "/vendor";
  return "/login";
}
