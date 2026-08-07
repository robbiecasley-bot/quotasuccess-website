-- QuotaSuccess lead capture schema.
-- Written to exclusively by netlify/functions/submit-lead.js using the
-- service-role key. RLS is enabled on every table with no public policies,
-- so the anon/public key (used client-side by site/js/admin.js) can only
-- ever read, never write, and only once signed in as the one admin account.
--
-- Shape: `leads` is one row per submission (email, company, role, the
-- offering they said they're interested in, and a PACE score rollup for
-- quick reference). `sign_responses` and `assessment_responses` are
-- normalised child tables holding the full per-question detail — every
-- "Signs you may need our help" question (selected true/false, not just
-- the ones picked) and every self-assessment question's exact 1-5 answer
-- — so nothing is lost to a summary.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('assessment', 'lead_capture')),
  email text not null,
  company text,
  role text,
  -- Domain rollup (0-100 per PACE domain) and which domain is "the block",
  -- kept here for quick reference; assessment_responses below has the full
  -- per-question detail behind these numbers.
  pace_scores jsonb,
  pace_block text,
  -- Which offering the visitor said they're most interested in. Sanitised
  -- against an allow-list server-side in submit-lead.js.
  service_interest text
);

alter table leads enable row level security;

-- Lets the admin dashboard (site/admin.html) read leads via Supabase Auth
-- (anon key + a logged-in session for this exact email) without ever
-- exposing the service-role key client-side. No other policy exists on
-- this table, so every other request (anonymous, or a different account)
-- still sees nothing.
create policy "admin can read leads" on leads
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'robbie@quotasuccess.com.au');

-- One row per "Signs you may need our help" question, per submission —
-- selected true/false for every question shown, not just the ones picked.
-- question_key is a stable slug (see the data-key attributes in
-- site/index.html) so a question's wording can change later without
-- breaking the link back to earlier responses; question_text is a snapshot
-- of the wording at submission time.
create table if not exists sign_responses (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  question_key text not null,
  domain text not null check (domain in ('position', 'acquire', 'convert', 'expand')),
  question_text text not null,
  selected boolean not null,
  created_at timestamptz not null default now()
);

alter table sign_responses enable row level security;

create index if not exists sign_responses_lead_id_idx on sign_responses (lead_id);

create policy "admin can read sign_responses" on sign_responses
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'robbie@quotasuccess.com.au');

-- One row per self-assessment question, per submission, with the exact
-- 1-5 answer given (1 = Absent .. 5 = Optimised). leads.pace_scores /
-- leads.pace_block keep the domain rollup for quick reference; this table
-- is where the detail behind those numbers lives.
create table if not exists assessment_responses (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  question_key text not null,
  domain text not null check (domain in ('position', 'acquire', 'convert', 'expand')),
  question_text text not null,
  scale_value smallint not null check (scale_value between 1 and 5),
  created_at timestamptz not null default now()
);

alter table assessment_responses enable row level security;

create index if not exists assessment_responses_lead_id_idx on assessment_responses (lead_id);

create policy "admin can read assessment_responses" on assessment_responses
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'robbie@quotasuccess.com.au');

-- Rate-limit bookkeeping for submit-lead.js. Logs every attempt (valid or
-- not) by IP so a burst of requests can be throttled with a 429. Separate
-- from `leads` so throttling data never mixes with actual lead records.
create table if not exists lead_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);

alter table lead_submission_attempts enable row level security;

create index if not exists lead_submission_attempts_ip_created_at_idx
  on lead_submission_attempts (ip, created_at);
