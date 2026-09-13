-- =====================================================
-- SANCTUARYS · Migration · Disponibilites des gardiennes
-- Charlotte (VageeSteam) et Princesse (Anubis 4 Venus) declarent
-- chacune, deux semaines a l'avance, les creneaux ou elles sont
-- disponibles. Le site public ne propose alors que les creneaux
-- ou la bonne gardienne (ou les deux, pour Anubis 4 Venus ou
-- Charlotte assiste en seconde main) s'est rendue disponible.
-- Logique d'accueil, pas de forcing : rien ne s'affiche tant que
-- la gardienne concernee n'a pas ouvert le creneau elle meme.
-- =====================================================

-- 1. Table des disponibilites declarees par chaque gardienne
create table if not exists public.gardienne_disponibilites (
  id uuid primary key default gen_random_uuid(),
  gardienne_id uuid not null references public.gardiennes(id) on delete cascade,
  sanctuary_id uuid not null references public.sanctuaries(id) on delete cascade,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  created_at timestamptz not null default now(),
  unique (gardienne_id, slot_start)
);

create index if not exists idx_gardienne_disponibilites_lookup
  on public.gardienne_disponibilites (sanctuary_id, slot_start);
create index if not exists idx_gardienne_disponibilites_gardienne
  on public.gardienne_disponibilites (gardienne_id, slot_start);

alter table public.gardienne_disponibilites enable row level security;

-- Aucune policy anon/authenticated : cette table n'est lue et modifiee
-- que par les Edge Functions (service role) protegees par le mot de
-- passe partage de l'espace gardienne, exactement comme le reste de
-- cet espace. get_available_slots ci-dessous est en security definer
-- pour pouvoir la lire malgre l'absence de policy publique.
drop policy if exists "admin manage disponibilites" on public.gardienne_disponibilites;
create policy "admin manage disponibilites" on public.gardienne_disponibilites
  for all to authenticated using (true) with check (true);

-- 2. Une seule seance a la fois : Charlotte est le goulot d'etranglement
-- commun (elle assure seule le VageeSteam et assiste en seconde main sur
-- l'Anubis 4 Venus), donc jamais deux soins en simultane a Paris.
update public.sanctuaries set capacity = 1 where slug = 'paris';

-- 3. Fonction creneaux disponibles, consciente du soin demande (p_type)
-- et croisant les disponibilites des deux gardiennes :
--   - 'anubis4venus' -> Princesse ET Charlotte doivent etre disponibles
--   - tout autre soin (VageeSteam) -> Charlotte doit etre disponible
-- L'ancienne fonction a 2 arguments (uuid, date) reste intacte pour les
-- appels qui ne precisent pas de soin (ex. boutique.html).
drop function if exists public.get_available_slots(uuid, date, text);

create or replace function public.get_available_slots(
  p_sanctuary_id uuid,
  p_date date,
  p_type text
) returns table (
  slot_start timestamptz,
  slot_end timestamptz,
  available boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  v_day_of_week integer;
  v_open time;
  v_close time;
  v_duration integer;
  v_buffer integer;
  v_capacity integer;
  v_current timestamptz;
  v_end timestamptz;
  v_tz text := 'Europe/Paris';
  v_taken integer;
  v_charlotte_id uuid;
  v_princesse_id uuid;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
begin
  if p_date < date '2026-09-01' then
    return;
  end if;

  v_day_of_week := extract(dow from p_date);

  select open_time, close_time, slot_duration_minutes, coalesce(buffer_minutes, 15)
    into v_open, v_close, v_duration, v_buffer
  from public.sanctuary_hours
  where sanctuary_id = p_sanctuary_id
    and day_of_week = v_day_of_week
    and active = true;

  if v_open is null then
    return; -- ferme ce jour
  end if;

  select coalesce(capacity, 1) into v_capacity
  from public.sanctuaries
  where id = p_sanctuary_id;

  select id into v_charlotte_id from public.gardiennes
    where lower(prenom) = 'charlotte' and active = true order by created_at limit 1;
  select id into v_princesse_id from public.gardiennes
    where lower(prenom) = 'princesse' and active = true order by created_at limit 1;

  v_current := (p_date + v_open) at time zone v_tz;
  v_end := (p_date + v_close) at time zone v_tz;

  while v_current + make_interval(mins => v_duration) <= v_end loop
    v_slot_start := v_current;
    v_slot_end := v_current + make_interval(mins => v_duration);

    -- Nombre de RDV deja actifs qui chevauchent ce creneau
    select count(*) into v_taken
    from public.appointments a
    where a.sanctuary_id = p_sanctuary_id
      and a.start_at < v_slot_end
      and (a.start_at + make_interval(mins => a.duration_minutes)) > v_slot_start
      and (
        a.status in ('confirmed', 'in_progress')
        or (a.status = 'pending_payment' and a.created_at > now() - interval '30 minutes')
      );

    available := v_taken < v_capacity;

    -- Croisement des disponibilites declarees par les gardiennes
    if available and p_type = 'anubis4venus' then
      if v_princesse_id is null or v_charlotte_id is null then
        available := false;
      else
        available :=
          exists (
            select 1 from public.gardienne_disponibilites d
            where d.gardienne_id = v_princesse_id
              and d.sanctuary_id = p_sanctuary_id
              and d.slot_start = v_slot_start
          )
          and exists (
            select 1 from public.gardienne_disponibilites d
            where d.gardienne_id = v_charlotte_id
              and d.sanctuary_id = p_sanctuary_id
              and d.slot_start = v_slot_start
          );
      end if;
    elsif available and p_type is not null then
      if v_charlotte_id is null then
        available := false;
      else
        available :=
          exists (
            select 1 from public.gardienne_disponibilites d
            where d.gardienne_id = v_charlotte_id
              and d.sanctuary_id = p_sanctuary_id
              and d.slot_start = v_slot_start
          );
      end if;
    end if;
    -- p_type null (retro-compatibilite) : comportement inchange, capacite seule

    slot_start := v_slot_start;
    slot_end := v_slot_end;
    return next;
    v_current := v_current + make_interval(mins => v_duration + v_buffer);
  end loop;
end $$;

grant execute on function public.get_available_slots(uuid, date, text) to anon, authenticated;

select 'Migration disponibilites gardiennes terminee ✦' as status;
