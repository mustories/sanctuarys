-- =====================================================
-- SANCTUARYS · Migration Outils Clients
-- Dossiers clients par praticien.ne + lien avec sessions
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- 1. Table outils_clients : dossier client par praticien.ne
create table if not exists public.outils_clients (
  id uuid primary key default gen_random_uuid(),
  praticien_id uuid not null references public.profiles(id) on delete cascade,
  prenom text not null,
  nom text,
  email text,
  telephone text,
  date_premiere_rencontre date,
  notes_privees text,
  archive boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_outils_clients_praticien
  on public.outils_clients(praticien_id, updated_at desc);

create index if not exists idx_outils_clients_search
  on public.outils_clients(praticien_id, prenom, nom);

-- 2. Ajoute client_id (optionnel) aux sessions Nahar
alter table public.outils_sessions
  add column if not exists client_id uuid references public.outils_clients(id) on delete set null;

create index if not exists idx_outils_sessions_client
  on public.outils_sessions(client_id, updated_at desc) where client_id is not null;

-- 3. Ajoute un type de scan : 'self' ou 'client'
alter table public.outils_sessions
  add column if not exists scan_type text default 'self' check (scan_type in ('self', 'client'));

-- 4. RLS Policies
alter table public.outils_clients enable row level security;

drop policy if exists "Clients: lecture/écriture par le praticien" on public.outils_clients;
create policy "Clients: lecture/écriture par le praticien"
  on public.outils_clients
  for all
  using (auth.uid() = praticien_id or public.is_admin())
  with check (auth.uid() = praticien_id or public.is_admin());

-- 5. Trigger updated_at sur outils_clients
create or replace function public.touch_outils_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists outils_clients_touch on public.outils_clients;
create trigger outils_clients_touch
  before update on public.outils_clients
  for each row execute function public.touch_outils_client();

-- 6. Trigger pour toucher le client quand une session est mise à jour
create or replace function public.touch_outils_client_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null then
    update public.outils_clients
      set updated_at = now()
      where id = new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists outils_sessions_touch_client on public.outils_sessions;
create trigger outils_sessions_touch_client
  after update on public.outils_sessions
  for each row execute function public.touch_outils_client_from_session();

select 'Dossiers clients créés ✦ outils_clients, client_id sur sessions, RLS' as status;
