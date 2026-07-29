/**
 * Formats a number using Indian digit grouping, e.g. formatInr(123456) -> "₹1,23,456".
 * Pure formatting, no secrets involved — safe to import from client components.
 */
export function formatInr(amount, { decimals = 0 } = {}) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(amount) ? amount : 0);
}
