-- =====================================================
-- SANCTUARYS · Migration Bilans radiesthésiques
-- Espace de Charlotte et Manthyta (gardiennes) : bilan
-- etat de l'uterus (%) + etat de receptivite (%) + allies
-- vegetaux du grimoire, analyse redigee par IA, expedie
-- par email au client et affiche dans son espace membre
-- =====================================================

create table if not exists public.bilans (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,

  client_prenom text not null,
  client_nom text,
  client_email text not null,

  etat_uterus_pct integer not null check (etat_uterus_pct between 0 and 100),
  etat_receptivite_pct integer not null check (etat_receptivite_pct between 0 and 100),

  elements_choisis jsonb not null default '[]'::jsonb,
  notes_gardienne text,

  analyse_chiffres text,
  vibration_energetique text,
  bienfaits_physiologiques text,
  avis_medical text,
  resume_final text,

  created_by text,
  generated_by text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bilans enable row level security;

-- Lecture ouverte (anon + authenticated) pour que l'espace membre puisse
-- retrouver les bilans d'une cliente par email, comme le reste de l'app.
drop policy if exists "public read bilans" on public.bilans;
create policy "public read bilans" on public.bilans
  for select to anon, authenticated using (true);

-- Aucune policy d'ecriture pour anon/authenticated : toute creation passe
-- exclusivement par l'edge function create-bilan (service role), elle-meme
-- protegee par le mot de passe partage des gardiennes.
drop policy if exists "admin manage bilans" on public.bilans;
create policy "admin manage bilans" on public.bilans
  for all to authenticated using (true) with check (true);

create index if not exists idx_bilans_email on public.bilans(client_email, created_at desc);
create index if not exists idx_bilans_appointment on public.bilans(appointment_id);

select 'Migration bilans terminee ✦' as status;
