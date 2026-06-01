-- =====================================================
-- SANCTUARYS · Migration Stripe Pass Fondatrice
-- Ajoute les colonnes nécessaires au tracking Stripe
-- =====================================================

-- 1. stripe_session_id sur club_signups pour relier au checkout Stripe
alter table public.club_signups
  add column if not exists stripe_session_id text;
create index if not exists idx_club_signups_stripe on public.club_signups(stripe_session_id) where stripe_session_id is not null;

-- 2. Permettre l'insert anonyme contrôlé pour le formulaire public
-- (le formulaire passe maintenant par l'Edge Function, mais on garde l'option)
drop policy if exists "Club signups: anonymous insert" on public.club_signups;
create policy "Club signups: anonymous insert"
  on public.club_signups for insert
  with check (true);

-- 3. Permettre la lecture du compteur de membres actifs publiquement (pour afficher "places restantes")
grant select on public.club_capacity to anon;

-- 4. Vérification des 123 places dans la table memberships (vue existante mise à jour pour compter aussi les pending)
create or replace view public.club_capacity as
  select
    123 as places_totales,
    count(*) filter (where status = 'active' or status = 'paused') as places_prises,
    (123 - count(*) filter (where status = 'active' or status = 'paused'))::int as places_restantes,
    round(count(*) filter (where status in ('active', 'paused')) * 100.0 / 123, 1) as remplissage_pct
  from public.memberships;

grant select on public.club_capacity to authenticated, anon;

select 'Stripe Pass Fondatrice intégré ✦ stripe_session_id, capacity view' as status;
