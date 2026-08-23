-- =====================================================
-- SANCTUARYS · Migration RDV : horaires lundi-samedi 12h-19h,
-- 15 min de battement entre les creneaux, 2 places par creneau,
-- ouverture des reservations a partir du 1er septembre 2026
-- =====================================================

-- 1. Capacite par lieu (nombre de sieges disponibles simultanement)
alter table public.sanctuaries
  add column if not exists capacity integer not null default 1;

update public.sanctuaries set capacity = 2 where slug = 'paris';

-- 2. Battement (pause) entre deux creneaux
alter table public.sanctuary_hours
  add column if not exists buffer_minutes integer not null default 15;

-- 3. Nouveaux horaires Paris : lundi(1) a samedi(6), 12h-19h, creneaux 1h, battement 15 min
do $$
declare
  paris_id uuid;
begin
  select id into paris_id from public.sanctuaries where slug = 'paris' limit 1;
  if paris_id is not null then
    -- On retire les anciens horaires (mardi-samedi 10h-18h) pour repartir propre
    delete from public.sanctuary_hours where sanctuary_id = paris_id;

    insert into public.sanctuary_hours (sanctuary_id, day_of_week, open_time, close_time, slot_duration_minutes, buffer_minutes) values
      (paris_id, 1, '12:00', '19:00', 60, 15),
      (paris_id, 2, '12:00', '19:00', 60, 15),
      (paris_id, 3, '12:00', '19:00', 60, 15),
      (paris_id, 4, '12:00', '19:00', 60, 15),
      (paris_id, 5, '12:00', '19:00', 60, 15),
      (paris_id, 6, '12:00', '19:00', 60, 15)
    on conflict (sanctuary_id, day_of_week) do update
      set open_time = excluded.open_time,
          close_time = excluded.close_time,
          slot_duration_minutes = excluded.slot_duration_minutes,
          buffer_minutes = excluded.buffer_minutes;
  end if;
end $$;

-- 4. Fonction creneaux disponibles : battement entre creneaux + capacite par lieu
--    + aucune reservation possible avant le 1er septembre 2026
create or replace function public.get_available_slots(
  p_sanctuary_id uuid,
  p_date date
) returns table (
  slot_start timestamptz,
  slot_end timestamptz,
  available boolean
) language plpgsql stable as $$
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
begin
  -- Pas de reservation avant le 1er septembre 2026
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

  v_current := (p_date + v_open) at time zone v_tz;
  v_end := (p_date + v_close) at time zone v_tz;

  while v_current + make_interval(mins => v_duration) <= v_end loop
    slot_start := v_current;
    slot_end := v_current + make_interval(mins => v_duration);

    -- Nombre de RDV deja actifs qui chevauchent ce creneau (confirmes/en cours,
    -- ou paiement en cours depuis moins de 30 min)
    select count(*) into v_taken
    from public.appointments a
    where a.sanctuary_id = p_sanctuary_id
      and a.start_at < slot_end
      and (a.start_at + make_interval(mins => a.duration_minutes)) > slot_start
      and (
        a.status in ('confirmed', 'in_progress')
        or (a.status = 'pending_payment' and a.created_at > now() - interval '30 minutes')
      );

    available := v_taken < v_capacity;

    return next;
    v_current := v_current + make_interval(mins => v_duration + v_buffer);
  end loop;
end $$;

grant execute on function public.get_available_slots(uuid, date) to anon, authenticated;

select 'Migration horaires + capacite terminee ✦' as status;
