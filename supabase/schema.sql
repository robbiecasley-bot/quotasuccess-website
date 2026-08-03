-- QuotaSuccess lead capture table.
-- Written to exclusively by netlify/functions/submit-lead.js using the
-- service-role key. RLS is enabled with no policies, so the anon/public key
-- (if ever exposed client-side) cannot read or write this table directly.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('assessment', 'lead_capture')),
  email text not null,
  company text,
  role text,
  pace_scores jsonb,
  pace_block text
);

alter table leads enable row level security;

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
