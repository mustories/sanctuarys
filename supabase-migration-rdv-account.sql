-- =====================================================
-- SANCTUARYS · Migration RDV : auto-creation compte cliente
-- Lie un appointment public au profil espace-membre cree
-- automatiquement apres paiement confirme
-- =====================================================

alter table public.appointments
  add column if not exists client_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_appointments_client_profile
  on public.appointments(client_profile_id)
  where client_profile_id is not null;

select 'Migration RDV compte cliente terminee ✦' as status;
