-- =====================================================
-- SANCTUARYS · Yoni Social Club
-- Migration espace membre privé (123 abonnées max)
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- 1. Ajouter le rôle 'membre' à la contrainte profiles
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'formatrice', 'student', 'praticienne', 'membre'));

-- 2. Table club_signups : pré-inscriptions publiques (avant Stripe)
create table if not exists public.club_signups (
  id uuid primary key default gen_random_uuid(),
  prenom text not null,
  nom text not null,
  email text not null,
  phone text not null,
  referral_source text,
  intention text,
  status text default 'pending' check (status in ('pending', 'contacted', 'accepted', 'rejected')),
  contacted_at timestamptz,
  member_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_club_signups_status on public.club_signups(status, created_at desc);

-- Insertion publique autorisée (formulaire de la page club)
alter table public.club_signups enable row level security;
drop policy if exists "Club signups: anonymous insert" on public.club_signups;
create policy "Club signups: anonymous insert"
  on public.club_signups for insert
  with check (true);
drop policy if exists "Club signups: admin read" on public.club_signups;
create policy "Club signups: admin read"
  on public.club_signups for select
  using (public.is_admin());
drop policy if exists "Club signups: admin update" on public.club_signups;
create policy "Club signups: admin update"
  on public.club_signups for update
  using (public.is_admin());

-- 3. Table memberships : abonnements actifs des membres
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  status text default 'active' check (status in ('active', 'paused', 'cancelled', 'expired')),
  started_at timestamptz default now(),
  current_period_start timestamptz default now(),
  current_period_end timestamptz default (now() + interval '40 days'),
  sessions_total int default 3,
  sessions_used int default 0,
  amount_paid_eur int default 180,
  stripe_subscription_id text,
  stripe_customer_id text,
  referral_code text unique,
  referred_by uuid references public.profiles(id) on delete set null,
  credit_balance_eur int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_memberships_member on public.memberships(member_id);
create index if not exists idx_memberships_active on public.memberships(status) where status = 'active';

alter table public.memberships enable row level security;
drop policy if exists "Memberships: member sees own" on public.memberships;
create policy "Memberships: member sees own"
  on public.memberships for select
  using (member_id = auth.uid() or public.is_admin());
drop policy if exists "Memberships: admin manages" on public.memberships;
create policy "Memberships: admin manages"
  on public.memberships for all
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Table cycle_logs : suivi du cycle menstruel
create table if not exists public.cycle_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  period_start_date date not null,
  period_end_date date,
  cycle_length_days int,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_cycle_logs_member on public.cycle_logs(member_id, period_start_date desc);

alter table public.cycle_logs enable row level security;
drop policy if exists "Cycle: member own" on public.cycle_logs;
create policy "Cycle: member own"
  on public.cycle_logs for all
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

-- 5. Table session_bookings : RDV YoniSpa
create table if not exists public.session_bookings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete set null,
  status text default 'requested' check (status in ('requested', 'confirmed', 'completed', 'cancelled', 'no_show')),
  proposed_slot_1 timestamptz,
  proposed_slot_2 timestamptz,
  proposed_slot_3 timestamptz,
  confirmed_slot timestamptz,
  session_type text default 'yonispa',
  member_note text,
  admin_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_session_bookings_member on public.session_bookings(member_id, created_at desc);
create index if not exists idx_session_bookings_pending on public.session_bookings(status) where status in ('requested', 'confirmed');

alter table public.session_bookings enable row level security;
drop policy if exists "Bookings: member access" on public.session_bookings;
create policy "Bookings: member access"
  on public.session_bookings for all
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

-- 6. Table session_reports : compte rendu de soin écrit par Princesse
create table if not exists public.session_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.session_bookings(id) on delete set null,
  session_date date,
  plantes_utilisees text,
  intention text,
  ce_qui_a_emerge text,
  recommandations text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_session_reports_member on public.session_reports(member_id, session_date desc);

alter table public.session_reports enable row level security;
drop policy if exists "Reports: member reads own" on public.session_reports;
create policy "Reports: member reads own"
  on public.session_reports for select
  using (member_id = auth.uid() or public.is_admin());
drop policy if exists "Reports: admin writes" on public.session_reports;
create policy "Reports: admin writes"
  on public.session_reports for all
  using (public.is_admin())
  with check (public.is_admin());

-- 7. Table member_journal : journal post-soin entre les séances
create table if not exists public.member_journal (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  mood text check (mood in ('lumineux', 'fluide', 'neutre', 'lourd', 'sombre') or mood is null),
  flagged boolean default false,
  admin_read boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_member_journal_member on public.member_journal(member_id, created_at desc);
create index if not exists idx_member_journal_flagged on public.member_journal(flagged) where flagged = true;

alter table public.member_journal enable row level security;
drop policy if exists "Journal: member access" on public.member_journal;
create policy "Journal: member access"
  on public.member_journal for all
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

-- 8. Table club_events : événements offerts aux membres
create table if not exists public.club_events (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  description text,
  type text check (type in ('en_ligne', 'presentiel', 'hybride')) default 'en_ligne',
  date_debut timestamptz not null,
  date_fin timestamptz,
  lieu text,
  lien_visio text,
  capacite int,
  inclus_dans_abonnement boolean default true,
  prix_non_membre_eur int,
  image_url text,
  status text default 'published' check (status in ('draft', 'published', 'cancelled', 'past')),
  created_at timestamptz default now()
);
create index if not exists idx_club_events_date on public.club_events(date_debut) where status = 'published';

alter table public.club_events enable row level security;
drop policy if exists "Events: members read" on public.club_events;
create policy "Events: members read"
  on public.club_events for select
  using (status = 'published' or public.is_admin());
drop policy if exists "Events: admin manage" on public.club_events;
create policy "Events: admin manage"
  on public.club_events for all
  using (public.is_admin())
  with check (public.is_admin());

-- 9. Table event_registrations : inscriptions des membres aux événements
create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  status text default 'registered' check (status in ('registered', 'attended', 'cancelled', 'no_show')),
  payment_status text default 'free' check (payment_status in ('free', 'paid', 'pending')),
  created_at timestamptz default now(),
  unique(event_id, member_id)
);
create index if not exists idx_event_registrations_member on public.event_registrations(member_id);

alter table public.event_registrations enable row level security;
drop policy if exists "Event regs: member access" on public.event_registrations;
create policy "Event regs: member access"
  on public.event_registrations for all
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

-- 10. Table member_products : produits achetés par la membre (historique)
create table if not exists public.member_products (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  product_name text not null,
  product_category text,
  price_eur int,
  purchased_at timestamptz default now(),
  notes text
);
create index if not exists idx_member_products_member on public.member_products(member_id, purchased_at desc);

alter table public.member_products enable row level security;
drop policy if exists "Products: member reads own" on public.member_products;
create policy "Products: member reads own"
  on public.member_products for select
  using (member_id = auth.uid() or public.is_admin());
drop policy if exists "Products: admin writes" on public.member_products;
create policy "Products: admin writes"
  on public.member_products for all
  using (public.is_admin())
  with check (public.is_admin());

-- 11. Generate referral code automatiquement à la création d'un membership
create or replace function public.generate_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prenom text;
  v_base text;
  v_code text;
  v_count int;
begin
  if new.referral_code is null then
    select lower(regexp_replace(prenom, '[^a-zA-Z]', '', 'g'))
      into v_prenom from public.profiles where id = new.member_id;
    v_base := coalesce(v_prenom, 'membre');
    v_code := v_base;
    select count(*) into v_count from public.memberships where referral_code = v_code;
    while v_count > 0 loop
      v_code := v_base || floor(random() * 1000)::text;
      select count(*) into v_count from public.memberships where referral_code = v_code;
    end loop;
    new.referral_code = v_code;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_referral_code on public.memberships;
create trigger memberships_referral_code
  before insert on public.memberships
  for each row execute function public.generate_referral_code();

-- 12. Mise à jour automatique de updated_at sur memberships
create or replace function public.touch_membership()
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
drop trigger if exists memberships_touch on public.memberships;
create trigger memberships_touch
  before update on public.memberships
  for each row execute function public.touch_membership();

-- 13. Vue : compteur de places restantes dans le Temple
create or replace view public.club_capacity as
  select
    123 as places_totales,
    count(*) filter (where status = 'active') as places_prises,
    123 - count(*) filter (where status = 'active') as places_restantes,
    round(count(*) filter (where status = 'active') * 100.0 / 123, 1) as remplissage_pct
  from public.memberships;

grant select on public.club_capacity to authenticated, anon;

select 'Yoni Social Club créé ✦ Memberships, cycle, RDV, journal, événements, parrainage' as status;
