/**
 * Resolves the app's public origin for building absolute URLs (magic-link
 * redirects, email links, etc).
 *
 * Prefers NEXT_PUBLIC_APP_URL when set — request.url's Host header reflects
 * whatever the request actually hit, which is fine directly against the
 * Next.js server but can be wrong once there's a proxy/CDN/load balancer in
 * front that doesn't forward it faithfully. NEXT_PUBLIC_APP_URL is the
 * explicit, always-correct source of truth for a given deployment when
 * configured. Falls back to the incoming request's own origin so local dev
 * (where the env var is typically left unset) keeps working without config.
 *
 * @param {Request} request - a Next.js Route Handler request (NextRequest).
 * @returns {string} origin with no trailing slash, e.g. "https://procurebid.example.com"
 */
export function getOrigin(request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return request.nextUrl.origin;
}
