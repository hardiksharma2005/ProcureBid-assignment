/**
 * Maximum delivery time (in days) used to normalize the delivery component.
 * Any bid promising delivery at or beyond this many days scores 0 on delivery.
 */
const MAX_DELIVERY_DAYS = 60;

/**
 * Computes a bid's weighted score for a sealed-bid reverse auction RFQ.
 *
 * Score = 100 * (0.60 * priceComponent + 0.25 * deliveryComponent + 0.15 * ratingComponent)
 *
 * Where:
 *   - priceComponent (60% weight): (ceiling_price_inr - price_inr) / ceiling_price_inr
 *       Lower price is better. A bid priced at the ceiling scores 0 on this
 *       component; a bid priced at 0 would score 1 (i.e. the full 60 points).
 *   - deliveryComponent (25% weight): (max_delivery_days - delivery_days) / max_delivery_days
 *       Faster delivery is better. A bid promising MAX_DELIVERY_DAYS (60) or
 *       more scores 0 on this component; a bid promising 0 days scores 1.
 *   - ratingComponent (15% weight): rating / 5
 *       Vendor's historical rating out of 5, scaled to a 0-1 fraction.
 *
 * Higher total score = better bid (higher is always preferred when ranking).
 *
 * @param {Object} params
 * @param {number} params.price_inr - The vendor's bid price, in INR per kg.
 * @param {number} params.ceiling_price_inr - The RFQ's ceiling price, in INR per kg.
 * @param {number} params.delivery_days - The vendor's promised delivery time, in days.
 * @param {number} [params.max_delivery_days=MAX_DELIVERY_DAYS] - Delivery days at which the delivery component bottoms out at 0.
 * @param {number} params.rating - The vendor's rating, on a 1-5 scale.
 * @returns {number} A weighted score from 0-100 (can go outside that range if price_inr > ceiling_price_inr or delivery_days > max_delivery_days).
 */
export function computeScore(params) {
  return computeScoreBreakdown(params).total;
}

/**
 * Same formula as computeScore, but returns the individual weighted
 * components (each already scaled to its point share — 60/25/15) alongside
 * the total, for UIs that need to show the reveal math instead of just the
 * final number. `total` is numerically identical to what computeScore(params)
 * returns.
 *
 * @param {Object} params - Same shape as computeScore's params.
 * @returns {{ price: number, delivery: number, rating: number, total: number }}
 */
export function computeScoreBreakdown({
  price_inr,
  ceiling_price_inr,
  delivery_days,
  max_delivery_days = MAX_DELIVERY_DAYS,
  rating,
}) {
  const priceComponent = (ceiling_price_inr - price_inr) / ceiling_price_inr;
  const deliveryComponent = (max_delivery_days - delivery_days) / max_delivery_days;
  const ratingComponent = rating / 5;

  const price = priceComponent * 60;
  const delivery = deliveryComponent * 25;
  const rating_points = ratingComponent * 15;

  return {
    price,
    delivery,
    rating: rating_points,
    total: price + delivery + rating_points,
  };
}
