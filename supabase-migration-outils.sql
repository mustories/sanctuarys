-- =====================================================
-- SANCTUARYS · Migration Outils (Sanctuarys Outils)
-- Verticale B2B pour praticiennes externes
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- 1. Ajouter le rôle 'praticienne' à la contrainte sur profiles
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'formatrice', 'student', 'praticienne'));

-- 2. Catalogue des outils disponibles
create table if not exists public.outils_catalogue (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nom text not null,
  description text,
  icone text default '✦',
  modele_ia text default 'claude-sonnet-4-6',
  actif boolean default true,
  ordre int default 0,
  created_at timestamptz default now()
);

-- Insertion de Nahar
insert into public.outils_catalogue (slug, nom, description, icone, modele_ia, ordre)
values (
  'nahar',
  'Nahar',
  'Conseil Quantique. Scan, décodage interconnecté et régulation immédiate de ta structure de vie et de business par les 12 piliers de l''hygiène vibratoire.',
  '✦',
  'claude-sonnet-4-6',
  1
) on conflict (slug) do update set
  nom = excluded.nom,
  description = excluded.description,
  modele_ia = excluded.modele_ia;

-- 3. Sessions de conversation avec chaque outil
create table if not exists public.outils_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  outil_slug text not null references public.outils_catalogue(slug) on delete cascade,
  titre text default 'Nouvelle session',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_outils_sessions_user
  on public.outils_sessions(user_id, updated_at desc);

-- 4. Messages dans chaque session
create table if not exists public.outils_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.outils_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tokens_in int,
  tokens_out int,
  created_at timestamptz default now()
);

create index if not exists idx_outils_messages_session
  on public.outils_messages(session_id, created_at asc);

-- 5. Trigger pour mettre à jour updated_at sur la session quand un nouveau message arrive
create or replace function public.touch_outils_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.outils_sessions
    set updated_at = now()
    where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists outils_messages_touch on public.outils_messages;
create trigger outils_messages_touch
  after insert on public.outils_messages
  for each row execute function public.touch_outils_session();

-- 6. RLS Policies
alter table public.outils_catalogue enable row level security;
alter table public.outils_sessions enable row level security;
alter table public.outils_messages enable row level security;

drop policy if exists "Catalogue: lecture pour tous authentifiés" on public.outils_catalogue;
create policy "Catalogue: lecture pour tous authentifiés"
  on public.outils_catalogue
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Sessions: lecture/écriture par le propriétaire" on public.outils_sessions;
create policy "Sessions: lecture/écriture par le propriétaire"
  on public.outils_sessions
  for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "Messages: lecture/écriture via session du propriétaire" on public.outils_messages;
create policy "Messages: lecture/écriture via session du propriétaire"
  on public.outils_messages
  for all
  using (
    exists (
      select 1 from public.outils_sessions s
      where s.id = outils_messages.session_id
      and (s.user_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.outils_sessions s
      where s.id = outils_messages.session_id
      and (s.user_id = auth.uid() or public.is_admin())
    )
  );

-- 7. Helper pour vérifier si l'utilisateur peut utiliser les outils
create or replace function public.is_praticienne()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('admin', 'praticienne')
  );
$$;

select 'Sanctuarys Outils créés ✦ Catalogue, sessions, messages, RLS' as status;
