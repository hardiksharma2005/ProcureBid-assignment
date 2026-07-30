/**
 * Maps a role to its dashboard path. Shared between the auth callback route
 * and the demo-mode login flow so the two redirect rules can't drift.
 * Pending/rejected vendors still go to /vendor — the page itself renders
 * the waiting/rejection screen instead of the RFQ list. Client-safe: no
 * server-only imports.
 *
 * @param {"buyer" | "vendor" | "vendor_pending" | "vendor_rejected" | null | undefined} role
 * @returns {string}
 */
export function getRedirectPathForRole(role) {
  if (role === "buyer") return "/buyer";
  if (role === "vendor" || role === "vendor_pending" || role === "vendor_rejected") return "/vendor";
  return "/login";
}
