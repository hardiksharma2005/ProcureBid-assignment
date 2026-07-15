import "server-only";

/**
 * Parses BUYER_EMAILS (comma-separated) into a normalized (trimmed,
 * lowercased) list, dropping empty segments left by stray commas or
 * whitespace. Falls back to the legacy single-value BUYER_EMAIL when
 * BUYER_EMAILS isn't set, so nothing breaks mid-migration.
 *
 * @returns {string[]}
 */
function getBuyerEmails() {
  const raw = process.env.BUYER_EMAILS ?? process.env.BUYER_EMAIL ?? "";

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Checks whether the given email belongs to a registered buyer.
 * Server-only: never import this in client components.
 *
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function isBuyerEmail(email) {
  if (!email) return false;

  const normalizedEmail = email.trim().toLowerCase();
  return getBuyerEmails().includes(normalizedEmail);
}
