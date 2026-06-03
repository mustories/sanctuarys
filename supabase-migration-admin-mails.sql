-- =====================================================
-- SANCTUARYS · Migration · Mails envoyés depuis admin
-- Garde l'historique de toutes les communications sortantes
-- =====================================================

create table if not exists public.admin_sent_emails (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text,
  resend_id text,
  sent_at timestamptz not null default now()
);

create index if not exists idx_admin_sent_emails_to on public.admin_sent_emails(to_email, sent_at desc);

alter table public.admin_sent_emails enable row level security;

drop policy if exists "Admin mails: lecture admin" on public.admin_sent_emails;
create policy "Admin mails: lecture admin"
  on public.admin_sent_emails for select
  using (public.is_admin());

drop policy if exists "Admin mails: insertion service" on public.admin_sent_emails;
create policy "Admin mails: insertion service"
  on public.admin_sent_emails for insert
  with check (true);

select 'Table admin_sent_emails créée ✦' as status;
