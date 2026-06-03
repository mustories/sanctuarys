-- =====================================================
-- SANCTUARYS · Migration · Connexion Outlook Microsoft 365
-- Stocke les tokens OAuth + les emails synchronisés
-- =====================================================

-- 1. Tokens OAuth (une seule ligne par compte Outlook connecté)
create table if not exists public.outlook_credentials (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  connected_by uuid references public.profiles(id),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  active boolean not null default true
);

alter table public.outlook_credentials enable row level security;

drop policy if exists "Outlook creds: admin uniquement" on public.outlook_credentials;
create policy "Outlook creds: admin uniquement"
  on public.outlook_credentials for all
  using (public.is_admin())
  with check (public.is_admin());

-- 2. Messages Outlook synchronisés
create table if not exists public.outlook_messages (
  id uuid primary key default gen_random_uuid(),
  outlook_id text not null unique,
  conversation_id text,
  thread_subject text,
  from_email text,
  from_name text,
  to_emails text[],
  cc_emails text[],
  subject text,
  body_preview text,
  body_html text,
  body_text text,
  received_at timestamptz not null,
  is_read boolean not null default false,
  is_starred boolean not null default false,
  has_attachments boolean default false,
  importance text,
  folder text default 'inbox',
  in_reply_to text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_outlook_messages_received on public.outlook_messages(received_at desc);
create index if not exists idx_outlook_messages_thread on public.outlook_messages(conversation_id, received_at);
create index if not exists idx_outlook_messages_unread on public.outlook_messages(is_read, received_at desc) where is_read = false;

alter table public.outlook_messages enable row level security;

drop policy if exists "Outlook messages: admin uniquement" on public.outlook_messages;
create policy "Outlook messages: admin uniquement"
  on public.outlook_messages for all
  using (public.is_admin())
  with check (public.is_admin());

-- 3. Réponses envoyées depuis l'admin
create table if not exists public.outlook_replies (
  id uuid primary key default gen_random_uuid(),
  in_reply_to_outlook_id text not null,
  to_email text not null,
  subject text,
  body text not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.profiles(id),
  outlook_sent_id text,
  ai_drafted boolean default false
);

create index if not exists idx_outlook_replies_to on public.outlook_replies(in_reply_to_outlook_id);

alter table public.outlook_replies enable row level security;

drop policy if exists "Outlook replies: admin uniquement" on public.outlook_replies;
create policy "Outlook replies: admin uniquement"
  on public.outlook_replies for all
  using (public.is_admin())
  with check (public.is_admin());

select 'Tables Outlook créées ✦ outlook_credentials, outlook_messages, outlook_replies' as status;
