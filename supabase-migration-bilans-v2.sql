-- =====================================================
-- SANCTUARYS · Migration Bilans v2
-- Relie les bilans a la vraie table gardiennes (remuneration,
-- agenda admin) et permet un bilan sur une seance Fondatrice
-- (session_bookings) en plus d'un rendez vous public (appointments)
-- =====================================================

alter table public.bilans
  add column if not exists gardienne_id uuid references public.gardiennes(id) on delete set null,
  add column if not exists session_booking_id uuid references public.session_bookings(id) on delete set null;

create index if not exists idx_bilans_session_booking on public.bilans(session_booking_id);

-- Seed Charlotte et Manthyta dans la vraie table gardiennes si elles n'y
-- sont pas deja (ne duplique jamais si elles existent sous un autre id).
do $$
declare
  paris_id uuid;
begin
  select id into paris_id from public.sanctuaries where slug = 'paris' limit 1;

  if not exists (select 1 from public.gardiennes where lower(prenom) = 'charlotte') then
    insert into public.gardiennes (prenom, sanctuary_id, active) values ('Charlotte', paris_id, true);
  end if;

  if not exists (select 1 from public.gardiennes where lower(prenom) = 'manthyta') then
    insert into public.gardiennes (prenom, sanctuary_id, active) values ('Manthyta', paris_id, true);
  end if;
end $$;

select 'Migration bilans v2 terminee ✦' as status;
