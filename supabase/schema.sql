-- ============================================================================
-- ProcureBid — database schema
--
-- How to run:
--   1. Open your project on https://supabase.com/dashboard
--   2. Go to the SQL Editor (left sidebar)
--   3. Click "New query", paste the entire contents of this file
--   4. Click "Run"
--
-- This script is idempotent for the seed data (uses ON CONFLICT DO NOTHING)
-- but table creation will fail if the tables already exist. Drop them first
-- if you need to re-run against a non-empty database.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  rating numeric(2,1) check (rating between 1 and 5),
  created_at timestamptz default now()
);

create table rfqs (
  id uuid primary key default gen_random_uuid(),
  material text not null,
  quantity_kg numeric not null,
  ceiling_price_inr numeric not null, -- price per kg
  description text,
  status text default 'draft' check (status in ('draft', 'open', 'closed', 'awarded', 'reauction')),
  window_minutes integer default 45, -- how long bidding stays open once published
  window_start timestamptz,
  window_end timestamptz,
  created_at timestamptz default now()
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid references rfqs(id) on delete cascade,
  vendor_id uuid references vendors(id),
  price_inr numeric not null check (price_inr > 0),
  delivery_days integer not null check (delivery_days > 0),
  created_at timestamptz default now(),
  unique (rfq_id, vendor_id) -- enforces one sealed bid per vendor per RFQ
);

create table awards (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid unique references rfqs(id),
  vendor_id uuid references vendors(id),
  winning_score numeric,
  award_reason text, -- buyer's stated reason, only meaningful when overridden
  overridden boolean default false, -- true when the buyer awarded someone other than L1
  awarded_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table vendors enable row level security;
alter table rfqs enable row level security;
alter table bids enable row level security;
alter table awards enable row level security;

-- vendors: authenticated users can read all vendor rows (needed to show
-- vendor names to the buyer). No insert/update/delete policies are defined,
-- so those operations are denied by default for anon/authenticated roles.
create policy "vendors_select_authenticated"
  on vendors for select
  to authenticated
  using (true);

-- rfqs: authenticated users can read RFQs that are no longer drafts.
-- No insert/update policies are defined, so writes must go through the
-- service role (server-side) instead of directly from the client.
create policy "rfqs_select_non_draft"
  on rfqs for select
  to authenticated
  using (status <> 'draft');

-- bids: a vendor may insert a bid for themselves only, only while the
-- parent RFQ is open and the bidding window hasn't closed. Vendors can
-- only ever see their own bids. There are no update/delete policies —
-- bids are immutable once submitted (sealed-bid guarantee).
create policy "bids_insert_own_open"
  on bids for insert
  to authenticated
  with check (
    vendor_id in (select id from vendors where email = auth.jwt() ->> 'email')
    and exists (
      select 1 from rfqs
      where rfqs.id = bids.rfq_id
        and rfqs.status = 'open'
        and now() < rfqs.window_end
    )
  );

create policy "bids_select_own"
  on bids for select
  to authenticated
  using (
    vendor_id in (select id from vendors where email = auth.jwt() ->> 'email')
  );

-- awards: authenticated users can read award results.
create policy "awards_select_authenticated"
  on awards for select
  to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- Table grants
--
-- RLS policies only decide which ROWS a role can see once it already has
-- table-level access — Postgres also requires an explicit GRANT before RLS
-- is even evaluated. Supabase projects normally get these automatically via
-- default privileges on the public schema, but if that's missing (as it was
-- here — service_role itself got "permission denied for table vendors"),
-- run this block explicitly. Safe to re-run any time.
-- ----------------------------------------------------------------------------

grant select on public.vendors to authenticated;
grant select on public.rfqs to authenticated;
grant select, insert on public.bids to authenticated;
grant select on public.awards to authenticated;

grant all on public.vendors, public.rfqs, public.bids, public.awards to service_role;

-- ----------------------------------------------------------------------------
-- Migrations
--
-- Run these if you already executed this file against your database before
-- the `window_minutes` column existed. Safe to re-run (IF NOT EXISTS).
-- ----------------------------------------------------------------------------

alter table rfqs add column if not exists window_minutes integer default 45;

-- Run this if you already executed this file before award overrides existed.
alter table awards add column if not exists award_reason text;
alter table awards add column if not exists overridden boolean default false;

-- ----------------------------------------------------------------------------
-- Tier 1 migration — buyer controls (auto-extend, pause/resume) and the
-- activity/audit log. Safe to re-run (IF NOT EXISTS).
-- ----------------------------------------------------------------------------

-- min_decrement_percent: the "minimum bid decrement" feature was removed
-- from the app. Column kept in place (unread/unwritten by app code) to
-- avoid a destructive migration — safe to drop later if desired.
alter table rfqs add column if not exists min_decrement_percent numeric default 0;
alter table rfqs add column if not exists auto_extend_enabled boolean default true;
alter table rfqs add column if not exists extension_count integer default 0;
alter table rfqs add column if not exists paused_at timestamptz;
alter table rfqs add column if not exists total_paused_ms bigint default 0;

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid references rfqs on delete cascade,
  actor_email text,
  actor_role text,
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);

alter table activity_log enable row level security;

-- activity_log rows routinely contain OTHER vendors' prices and names
-- (e.g. bid_placed, awarded details) — those must stay buyer-only. There is
-- no buyers table to check "is this authenticated user a buyer" against in
-- SQL (buyer status is an env var allowlist, checked only in application
-- code via requireBuyer()), so RLS cannot safely grant buyers broad read
-- access here. The buyer-only /api/rfqs/[id]/activity route reads via the
-- service role instead, which bypasses RLS entirely.
-- The one thing RLS *can* safely allow is a vendor reading their own
-- actions back (mirrors the bids_select_own pattern) — this never exposes
-- another vendor's data. All writes go through the service role from
-- lib/auditLog.js, never directly from a client.
create policy "activity_log_select_own_actions"
  on activity_log for select
  to authenticated
  using (actor_email = auth.jwt() ->> 'email');

grant select, insert on public.activity_log to service_role;
grant select on public.activity_log to authenticated;

-- ----------------------------------------------------------------------------
-- Archive migration — view-only archiving of decided RFQs. Safe to re-run.
-- ----------------------------------------------------------------------------

alter table rfqs add column if not exists archived_at timestamptz;

-- ----------------------------------------------------------------------------
-- Vendor registration + approval migration. Safe to re-run (IF NOT EXISTS).
-- ----------------------------------------------------------------------------

alter table vendors add column if not exists status text default 'approved' check (status in ('pending','approved','rejected'));
alter table vendors add column if not exists company_name text;
alter table vendors add column if not exists contact_phone text;
alter table vendors add column if not exists registered_at timestamptz default now();
alter table vendors add column if not exists approved_at timestamptz;
alter table vendors add column if not exists rejection_reason text;
alter table vendors alter column rating drop not null;

create index if not exists idx_vendors_status on vendors(status);
create index if not exists idx_bids_rfq on bids(rfq_id);
create index if not exists idx_rfqs_status on rfqs(status);

-- ----------------------------------------------------------------------------
-- Seed data
-- ----------------------------------------------------------------------------

insert into vendors (name, email, rating) values
  ('Shree Balaji Steel Traders', 'vendor1@example.com', 4.5),
  ('Jindal Ispat Suppliers', 'vendor2@example.com', 4.2),
  ('Vardhman Steel Industries', 'vendor3@example.com', 3.8),
  ('Bhushan Metal Works', 'vendor4@example.com', 4.0),
  ('Om Sai Steel Corporation', 'vendor5@example.com', 3.5)
on conflict (email) do nothing;
