# ProcureBid

A sealed-bid reverse auction platform for raw-material procurement. A buyer posts an RFQ (material, quantity, ceiling price, bidding window); pre-registered vendors each submit one sealed bid — price and delivery time — with no visibility into competitors' bids until the window closes. The buyer then reveals all bids, sees a transparent weighted-score breakdown, and awards the contract.

## Architecture

- **Next.js 14 (App Router, JavaScript)** — buyer dashboard, vendor portal, and all API routes (Route Handlers) in one app.
- **Supabase**
  - **Postgres** — `vendors`, `rfqs`, `bids`, `awards` tables, with Row Level Security and a `UNIQUE(rfq_id, vendor_id)` constraint enforcing one sealed bid per vendor per RFQ.
  - **Auth** — passwordless magic-link sign-in via `@supabase/ssr`, gated by an application-level allowlist (see [Security model](#security-model)).
  - **Realtime (Broadcast)** — rank-only live updates when bids are placed, so both the buyer's bid count and a vendor's own rank update without a page refresh.
- **Gmail SMTP (via Nodemailer)** — all transactional email: RFQ invites, bid outcome notifications, award confirmations.
- **Groq (Llama 3.3 70B)** — optional AI-assisted RFQ creation: the buyer describes a requirement in plain English and gets a pre-filled form, including an indicative ceiling-price suggestion the buyer must explicitly accept.

Server-side Supabase access always goes through one of two clients (`lib/supabaseServer.js` for the caller's own session, `lib/supabaseAdmin.js` for privileged service-role operations), never a client-side key with elevated privileges.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables** — copy `.env.local.example` to `.env.local` and fill in real values:
   ```bash
   cp .env.local.example .env.local
   ```
   | Variable | Purpose |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (base URL only, no path suffix) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key, used by the browser client |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key — server-only, bypasses RLS |
   | `BUYER_EMAIL` | The single email allowed to sign in as the buyer |
   | `GMAIL_USER` | Gmail address used as the SMTP sender |
   | `GMAIL_APP_PASSWORD` | Gmail [app password](https://myaccount.google.com/apppasswords) (not your account password) |
   | `GROQ_API_KEY` | Groq API key, used only by the optional AI-assist endpoint |

3. **Set up the database** — open your Supabase project's SQL Editor and run the full contents of [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, RLS policies, table grants, and seeds 5 sample vendors. If you're re-running it against a database from an earlier version of this schema, see the "Migrations" section near the bottom of that file.

4. **Configure Supabase Auth**
   - Enable email sign-in and allow new user signups (Authentication → Providers → Email).
   - Configure custom SMTP (Authentication → Settings → SMTP Settings) using the same Gmail credentials above, so Supabase's own auth emails send reliably.

5. **Run the app**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000`.

## Scoring formula

Every bid is ranked by a single weighted score out of 100, computed in [`lib/scoring.js`](lib/scoring.js):

```
score = 100 × (0.60 × priceComponent + 0.25 × deliveryComponent + 0.15 × ratingComponent)
```

| Component | Weight | Formula | Notes |
|---|---|---|---|
| Price | 60% | `(ceiling_price_inr − price_inr) / ceiling_price_inr` | Lower price is better; a bid at the ceiling scores 0 here. |
| Delivery | 25% | `(max_delivery_days − delivery_days) / max_delivery_days` | Faster is better; `max_delivery_days` is fixed at **60**, so a bid promising 60+ days scores 0 here. |
| Rating | 15% | `rating / 5` | Vendor's historical rating, 1–5 scale. |

Higher total score wins. The buyer sees the full breakdown for every bid only after the window closes (`GET /api/rfqs/[id]/bids`); a vendor can preview their own prospective score before submitting, computed from data they're already entitled to (their own price, delivery time, and rating).

## Security model

- **Allowlist auth, not open signup.** Magic links are only sent to `BUYER_EMAIL` or an email already present in `vendors` (checked server-side in `POST /api/auth/request-link` before calling Supabase's `signInWithOtp`). Anyone can attempt to sign in; only allowlisted emails ever receive a link.
- **RLS + explicit grants on every table.** Row Level Security is enabled on `vendors`, `rfqs`, `bids`, and `awards`, with policies scoping reads/writes to `authenticated` users and their own rows. Table-level `GRANT`s are set explicitly rather than relying on Supabase's default privileges (see the comment in `supabase/schema.sql` — this is not always automatic).
- **One sealed bid per vendor.** `UNIQUE(rfq_id, vendor_id)` on the `bids` table makes a second submission fail at the database level, not just in application code; the API surfaces this as a friendly 409.
- **Sealed until close.** No route — buyer or vendor — returns another party's price while an RFQ's status is `draft` or `open`. The buyer-only reveal endpoint (`GET /api/rfqs/[id]/bids`) explicitly 403s until the RFQ is `closed`, `awarded`, or `reauction`.
- **Rank-only realtime broadcasts.** The `bids_changed` Supabase Realtime event carries an empty payload — it's purely a "something changed, go re-fetch your own authorized view" signal. No bid data ever travels over the broadcast channel itself.
- **Server-only secrets.** `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_APP_PASSWORD`, and `GROQ_API_KEY` are only ever read in server-side modules guarded by the `server-only` package (e.g. `lib/supabaseAdmin.js`, `lib/mailer.js`), which fails the build if accidentally imported into a client component. Verified by grepping the production client bundle (`.next/static`) for all three secrets after every change.
