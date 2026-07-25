-- Launch email infrastructure. Deliberately NOT a column on
-- waitlist_signups: the sending address (grind@joingrindapp.com) is meant to
-- be reused for future newsletters/promos, not just this one launch email,
-- so tracking is keyed by (recipient_email, campaign) instead of tied to any
-- one source table - a future campaign just needs its own campaign string,
-- no new migration required, and can pull recipients from anywhere (this
-- waitlist, profiles, wherever) without changing this table.
create table public.email_sends (
  recipient_email text not null,
  campaign text not null,
  sent_at timestamptz not null default now(),
  primary key (recipient_email, campaign)
);

alter table public.email_sends enable row level security;
-- No client policies - default-deny for anon/authenticated, same pattern as
-- platform_connections. Only ever touched by the service_role key inside
-- Edge Functions.
