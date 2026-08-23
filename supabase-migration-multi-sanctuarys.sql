-- =====================================================
-- SANCTUARYS · Migration multi-lieux
-- - Table contact_messages (formulaire homepage)
-- - Table sanctuaries (lieux physiques)
-- - Table gardiennes (praticiennes)
-- - Table plants (catalogue Bar a plantes)
-- - Adaptation session_bookings avec sanctuary_id + gardienne_id
-- =====================================================

-- 1. Contact / prise de RDV depuis homepage
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  prenom text,
  nom text,
  email text not null,
  phone text,
  ville text,
  sujet text,
  message text,
  allaitement text,
  source text,
  status text default 'new' check (status in ('new', 'answered', 'archived')),
  answered_at timestamptz,
  answered_by uuid,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists "public insert contact_messages" on public.contact_messages;
create policy "public insert contact_messages" on public.contact_messages
  for insert to anon, authenticated with check (true);

drop policy if exists "admin read contact_messages" on public.contact_messages;
create policy "admin read contact_messages" on public.contact_messages
  for select to authenticated using (true);

drop policy if exists "admin update contact_messages" on public.contact_messages;
create policy "admin update contact_messages" on public.contact_messages
  for update to authenticated using (true) with check (true);

create index if not exists idx_contact_messages_status on public.contact_messages(status, created_at desc);

-- 2. Sanctuaries (les lieux physiques)
create table if not exists public.sanctuaries (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  ville text not null,
  pays text not null default 'France',
  adresse text,
  code_postal text,
  timezone text default 'Europe/Paris',
  telephone text,
  email text,
  active boolean not null default false,
  opening_date date,
  description text,
  ordre integer default 100,
  slug text unique,
  created_at timestamptz not null default now()
);

alter table public.sanctuaries enable row level security;

drop policy if exists "public read active sanctuaries" on public.sanctuaries;
create policy "public read active sanctuaries" on public.sanctuaries
  for select to anon, authenticated using (true);

drop policy if exists "admin manage sanctuaries" on public.sanctuaries;
create policy "admin manage sanctuaries" on public.sanctuaries
  for all to authenticated using (true) with check (true);

-- Seed Paris et Bruxelles
insert into public.sanctuaries (nom, ville, pays, adresse, code_postal, active, description, slug, ordre)
values
  ('Sanctuarys Paris', 'Paris', 'France', '69 rue Traversiere', '75012', true, 'Premiere maison Sanctuarys. Analyse radiesthesique, Bar a plantes, Bain Vapeur Vaginal. Sur rendez-vous.', 'paris', 10),
  ('Sanctuarys Bruxelles', 'Bruxelles', 'Belgique', null, null, false, 'Deuxieme maison Sanctuarys. Ouverture prochaine.', 'bruxelles', 20)
on conflict do nothing;

-- 3. Gardiennes (praticiennes formees, rattachees a un lieu)
create table if not exists public.gardiennes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  sanctuary_id uuid references public.sanctuaries(id) on delete set null,
  prenom text not null,
  nom text,
  bio text,
  photo_url text,
  specialites text[],
  active boolean not null default true,
  since date,
  created_at timestamptz not null default now()
);

alter table public.gardiennes enable row level security;

drop policy if exists "public read gardiennes" on public.gardiennes;
create policy "public read gardiennes" on public.gardiennes
  for select to anon, authenticated using (active = true);

drop policy if exists "admin manage gardiennes" on public.gardiennes;
create policy "admin manage gardiennes" on public.gardiennes
  for all to authenticated using (true) with check (true);

-- 4. Plants (catalogue Bar a plantes central)
create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  reference text unique,
  categorie text check (categorie in ('synergie', 'plante', 'resine', 'huile', 'encens', 'bain', 'autre')),
  format text,
  prix_ttc numeric(10, 2),
  indications text[],
  usages_traditionnels text,
  lecture_energetique text,
  posologie text,
  contre_indications text,
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.plants enable row level security;

drop policy if exists "public read active plants" on public.plants;
create policy "public read active plants" on public.plants
  for select to anon, authenticated using (active = true);

drop policy if exists "admin manage plants" on public.plants;
create policy "admin manage plants" on public.plants
  for all to authenticated using (true) with check (true);

-- 5. Uterus analyses (compte rendu de radiesthesie)
create table if not exists public.uterus_analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.club_signups(id) on delete set null,
  gardienne_id uuid references public.gardiennes(id) on delete set null,
  sanctuary_id uuid references public.sanctuaries(id) on delete set null,
  analysis_date timestamptz not null default now(),
  cartographie text,
  equilibre_yin_yang text,
  memoire_residus text,
  fertilite_notes text,
  synthese text,
  created_at timestamptz not null default now()
);

alter table public.uterus_analyses enable row level security;

drop policy if exists "clients read own analyses" on public.uterus_analyses;
create policy "clients read own analyses" on public.uterus_analyses
  for select to authenticated
  using (
    exists (
      select 1 from public.club_signups cs
      where cs.id = client_id and cs.member_id = auth.uid()
    )
  );

drop policy if exists "admin manage analyses" on public.uterus_analyses;
create policy "admin manage analyses" on public.uterus_analyses
  for all to authenticated using (true) with check (true);

-- 6. Plant prescriptions (issues d'une analyse)
create table if not exists public.plant_prescriptions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.uterus_analyses(id) on delete cascade,
  plant_id uuid references public.plants(id) on delete restrict,
  quantite integer default 1,
  duree_jours integer,
  posologie_perso text,
  created_at timestamptz not null default now()
);

alter table public.plant_prescriptions enable row level security;

drop policy if exists "clients read own prescriptions" on public.plant_prescriptions;
create policy "clients read own prescriptions" on public.plant_prescriptions
  for select to authenticated
  using (
    exists (
      select 1 from public.uterus_analyses ua
      join public.club_signups cs on cs.id = ua.client_id
      where ua.id = analysis_id and cs.member_id = auth.uid()
    )
  );

drop policy if exists "admin manage prescriptions" on public.plant_prescriptions;
create policy "admin manage prescriptions" on public.plant_prescriptions
  for all to authenticated using (true) with check (true);

-- 7. Home cures (commandes cure a domicile)
create table if not exists public.home_cures (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  client_name text,
  destination_country text not null,
  destination_city text,
  destination_address text,
  cure_type text,
  status text default 'requested' check (status in ('requested', 'analyzed', 'prescribed', 'preparing', 'shipped', 'delivered', 'completed', 'cancelled')),
  analysis_id uuid references public.uterus_analyses(id),
  tracking_number text,
  price_total_eur numeric(10, 2),
  notes text,
  requested_at timestamptz not null default now(),
  shipped_at timestamptz,
  delivered_at timestamptz
);

alter table public.home_cures enable row level security;

drop policy if exists "public insert home cures" on public.home_cures;
create policy "public insert home cures" on public.home_cures
  for insert to anon, authenticated with check (true);

drop policy if exists "admin manage home cures" on public.home_cures;
create policy "admin manage home cures" on public.home_cures
  for all to authenticated using (true) with check (true);

-- 8. Adaptation session_bookings pour multi-lieux
alter table public.session_bookings
  add column if not exists sanctuary_id uuid references public.sanctuaries(id),
  add column if not exists gardienne_id uuid references public.gardiennes(id);

-- Fixer Paris par defaut sur les reservations existantes
update public.session_bookings sb
   set sanctuary_id = (select id from public.sanctuaries where slug = 'paris' limit 1)
 where sanctuary_id is null;

select 'Migration multi-lieux terminee ✦' as status;
