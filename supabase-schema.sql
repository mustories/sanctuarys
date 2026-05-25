-- =====================================================
-- SANCTUARYS · Schéma de base de données
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. TABLE PROFILES (étend auth.users)
-- =====================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text not null,
  nom text,
  email text,
  phone text,
  role text not null default 'student' check (role in ('student', 'admin')),
  cohort text default 'Lune 2026',
  formation text default 'V-Care',
  current_module int default 1 check (current_module between 1 and 6),
  current_day int default 1,
  status text default 'active' check (status in ('active', 'paused', 'completed', 'attention')),
  internal_note text,
  avatar_color text default 'terracotta',
  module_started_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_status on public.profiles(status);

-- =====================================================
-- 2. TABLE MODULE_PROGRESS (suivi par module par élève)
-- =====================================================
create table if not exists public.module_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  module_number int not null check (module_number between 1 and 6),
  status text not null default 'locked' check (status in ('locked', 'in_progress', 'completed')),
  progress_percent int default 0 check (progress_percent between 0 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(student_id, module_number)
);

create index if not exists idx_module_progress_student on public.module_progress(student_id);

-- =====================================================
-- 3. TABLE JOURNAL_ENTRIES (le journal de bord)
-- =====================================================
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  module_number int not null,
  day_number int not null,
  date date not null default current_date,
  body text default '',
  observation text default '',
  ratings jsonb default '{}',
  submitted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, module_number, day_number)
);

create index if not exists idx_journal_student on public.journal_entries(student_id);
create index if not exists idx_journal_submitted on public.journal_entries(submitted) where submitted = true;

-- =====================================================
-- 4. TABLE NOTES (notes libres)
-- =====================================================
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists idx_notes_student on public.notes(student_id);

-- =====================================================
-- 5. TABLE MESSAGES (chat élève ↔ formatrice)
-- =====================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_messages_from on public.messages(from_id);
create index if not exists idx_messages_to on public.messages(to_id);
create index if not exists idx_messages_unread on public.messages(read) where read = false;

-- =====================================================
-- 6. TABLE DAILY_PROMPTS (les questions du jour)
-- =====================================================
create table if not exists public.daily_prompts (
  id uuid primary key default gen_random_uuid(),
  module_number int not null,
  day_number int not null,
  title text not null,
  prompt_text text not null,
  unique(module_number, day_number)
);

-- Seed les 14 prompts du module 02
insert into public.daily_prompts (module_number, day_number, title, prompt_text) values
  (2, 1, 'Le commencement', 'Au lendemain de ton premier protocole, comment ton corps t''accueille-t-il ce matin ? Pose une main sur ton bas-ventre. Reste là un instant. Que ressens-tu sous ta paume ? Une chaleur, un calme, une présence inhabituelle ? Sans interpréter, juste accueillir.'),
  (2, 2, 'L''écoute subtile', 'Aujourd''hui, prends un instant pour observer les sensations subtiles dans ton bas-ventre. Que perçois-tu ? Une chaleur, un picotement, un silence, un poids ? Sans interpréter, juste observer.'),
  (2, 3, 'Les pertes', 'As-tu remarqué un changement dans tes pertes ces deux derniers jours ? Couleur, texture, quantité, odeur. Le corps féminin parle par là.'),
  (2, 4, 'Le sommeil', 'Comment dors-tu depuis le protocole ? Réveils nocturnes, rêves marquants, énergie au réveil. Note tout ce qui te semble nouveau.'),
  (2, 5, 'L''émotion', 'Quelle émotion dominante t''habite cette semaine ? Sans la juger, nomme-la. D''où vient-elle ? Comment se manifeste-t-elle dans ton corps ?'),
  (2, 6, 'Le ventre', 'Aujourd''hui, observe ton ventre tout au long de la journée. À quels moments est-il détendu ? Tendu ? Vivant ? Endormi ?'),
  (2, 7, 'Bilan de la première semaine', 'Sept jours déjà. Relis tes entrées précédentes. Quel fil rouge se dessine ? Quelle évolution remarques-tu depuis le protocole ?'),
  (2, 8, 'L''intuition', 'Une intuition particulière t''a-t-elle traversée cette semaine ? Une voix intérieure plus claire, une décision qui s''impose ?'),
  (2, 9, 'Le corps en mouvement', 'Comment ton corps se sent-il en mouvement ? Marche, danse, étirements. Y a-t-il un endroit qui demande à bouger plus ?'),
  (2, 10, 'Les rêves', 'Quels rêves se sont présentés depuis le début du cycle ? Personnages, lieux, sensations. Note ce qui revient.'),
  (2, 11, 'La sexualité sacrée', 'Comment ta relation à ta propre sensualité a-t-elle évolué ? Présence à ton corps, désir, plaisir intime.'),
  (2, 12, 'L''ancrage', 'Quel ancrage as-tu trouvé dans ce protocole ? Qu''est-ce qui s''est déposé en toi de manière durable ?'),
  (2, 13, 'Préparation', 'Le prochain seuil approche, le bain à l''encens. Quelles intentions, quelles questions amènes-tu vers lui ?'),
  (2, 14, 'Bilan du cycle', 'Quatorze jours. Relis tout ton journal. Que retiens-tu ? Quelle facilitatrice émerge déjà à travers toi ?')
on conflict (module_number, day_number) do nothing;

-- =====================================================
-- 7. RLS · Row Level Security
-- =====================================================
alter table public.profiles enable row level security;
alter table public.module_progress enable row level security;
alter table public.journal_entries enable row level security;
alter table public.notes enable row level security;
alter table public.messages enable row level security;
alter table public.daily_prompts enable row level security;

-- ---- PROFILES ----
drop policy if exists "Profiles: see own" on public.profiles;
create policy "Profiles: see own" on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles: admin sees all" on public.profiles;
create policy "Profiles: admin sees all" on public.profiles for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own" on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Profiles: admin manages all" on public.profiles;
create policy "Profiles: admin manages all" on public.profiles for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ---- MODULE PROGRESS ----
drop policy if exists "Modules: see own" on public.module_progress;
create policy "Modules: see own" on public.module_progress for select
  using (student_id = auth.uid());

drop policy if exists "Modules: admin all" on public.module_progress;
create policy "Modules: admin all" on public.module_progress for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ---- JOURNAL ENTRIES ----
drop policy if exists "Journal: own entries" on public.journal_entries;
create policy "Journal: own entries" on public.journal_entries for all
  using (student_id = auth.uid());

drop policy if exists "Journal: admin reads" on public.journal_entries;
create policy "Journal: admin reads" on public.journal_entries for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ---- NOTES ----
drop policy if exists "Notes: own" on public.notes;
create policy "Notes: own" on public.notes for all
  using (student_id = auth.uid());

drop policy if exists "Notes: admin reads" on public.notes;
create policy "Notes: admin reads" on public.notes for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ---- MESSAGES ----
drop policy if exists "Messages: see mine" on public.messages;
create policy "Messages: see mine" on public.messages for select
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "Messages: send mine" on public.messages;
create policy "Messages: send mine" on public.messages for insert
  with check (from_id = auth.uid());

drop policy if exists "Messages: mark read" on public.messages;
create policy "Messages: mark read" on public.messages for update
  using (to_id = auth.uid());

-- ---- DAILY PROMPTS (publics en lecture) ----
drop policy if exists "Prompts: read" on public.daily_prompts;
create policy "Prompts: read" on public.daily_prompts for select
  using (auth.role() = 'authenticated');

-- =====================================================
-- 8. TRIGGER · auto-créer un profile à l'inscription
-- =====================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, prenom, nom, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'prenom', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'nom',
    new.email
  );

  -- Initialise les 6 modules verrouillés
  insert into public.module_progress (student_id, module_number, status)
  select new.id, m, case when m = 1 then 'in_progress' else 'locked' end
  from generate_series(1, 6) m;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- 9. TRIGGER · auto-update updated_at
-- =====================================================
create or replace function public.update_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_journal_updated on public.journal_entries;
create trigger trg_journal_updated
  before update on public.journal_entries
  for each row execute function public.update_timestamp();

drop trigger if exists trg_profile_updated on public.profiles;
create trigger trg_profile_updated
  before update on public.profiles
  for each row execute function public.update_timestamp();

-- =====================================================
-- 10. ACTIVER REALTIME pour messages et journaux
-- =====================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.journal_entries;
alter publication supabase_realtime add table public.notes;

-- =====================================================
-- FIN DU SCHEMA
-- =====================================================
-- Après avoir exécuté ce script :
-- 1. Va dans Authentication → Users et crée 2 comptes manuellement :
--    a) Ton compte formatrice : princessetchassi@gmail.com (mot de passe au choix)
--    b) Le compte d'Angélique : son email + mot de passe (à lui transmettre)
-- 2. Puis exécute :
--    UPDATE profiles SET role='admin' WHERE email='princessetchassi@gmail.com';
--    UPDATE profiles SET prenom='Angélique', current_module=2, current_day=1
--      WHERE email='angelique@son-email.com';
-- =====================================================
