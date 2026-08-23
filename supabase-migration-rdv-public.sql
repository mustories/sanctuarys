-- =====================================================
-- SANCTUARYS · Migration RDV publics
-- Prise de rendez-vous grand public, creneaux 1h a 66€
-- Paiement Stripe en amont, table appointments
-- =====================================================

-- 1. Horaires d'ouverture par sanctuary
create table if not exists public.sanctuary_hours (
  id uuid primary key default gen_random_uuid(),
  sanctuary_id uuid not null references public.sanctuaries(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  slot_duration_minutes integer not null default 60,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(sanctuary_id, day_of_week)
);

alter table public.sanctuary_hours enable row level security;
drop policy if exists "public read hours" on public.sanctuary_hours;
create policy "public read hours" on public.sanctuary_hours
  for select to anon, authenticated using (active = true);
drop policy if exists "admin manage hours" on public.sanctuary_hours;
create policy "admin manage hours" on public.sanctuary_hours
  for all to authenticated using (true) with check (true);

-- Seed horaires Paris : Mardi a Samedi 10h-18h (8 creneaux d'1h)
-- Lundi et Dimanche fermes
do $$
declare
  paris_id uuid;
begin
  select id into paris_id from public.sanctuaries where slug = 'paris' limit 1;
  if paris_id is not null then
    -- 0=dimanche, 1=lundi, 2=mardi, ...
    insert into public.sanctuary_hours (sanctuary_id, day_of_week, open_time, close_time, slot_duration_minutes) values
      (paris_id, 2, '10:00', '18:00', 60),
      (paris_id, 3, '10:00', '18:00', 60),
      (paris_id, 4, '10:00', '18:00', 60),
      (paris_id, 5, '10:00', '18:00', 60),
      (paris_id, 6, '10:00', '18:00', 60)
    on conflict (sanctuary_id, day_of_week) do nothing;
  end if;
end $$;

-- 2. RDV publics (appointments)
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  sanctuary_id uuid not null references public.sanctuaries(id) on delete restrict,
  gardienne_id uuid references public.gardiennes(id) on delete set null,

  -- Client
  client_prenom text not null,
  client_nom text not null,
  client_email text not null,
  client_phone text,
  client_ville text,
  client_notes text,
  is_allaitement boolean default false,

  -- Creneau
  start_at timestamptz not null,
  duration_minutes integer not null default 60,

  -- Paiement
  price_total_eur numeric(10,2) not null default 66.00,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  paid_at timestamptz,

  -- Statut
  status text not null default 'pending_payment' check (status in ('pending_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'refunded')),
  cancellation_reason text,

  -- Suivi
  admin_notes text,
  session_report text,
  analysis_id uuid references public.uterus_analyses(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

drop policy if exists "public read own by email" on public.appointments;
create policy "public read own by email" on public.appointments
  for select to anon, authenticated using (true);

drop policy if exists "public insert appointments" on public.appointments;
create policy "public insert appointments" on public.appointments
  for insert to anon, authenticated with check (true);

drop policy if exists "admin manage appointments" on public.appointments;
create policy "admin manage appointments" on public.appointments
  for all to authenticated using (true) with check (true);

create index if not exists idx_appointments_sanctuary_time on public.appointments(sanctuary_id, start_at)
  where status in ('pending_payment', 'confirmed', 'in_progress');
create index if not exists idx_appointments_status on public.appointments(status, start_at);
create index if not exists idx_appointments_email on public.appointments(client_email, created_at desc);

-- 3. Fonction pour lister les creneaux disponibles d'un jour
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
  v_current timestamptz;
  v_end timestamptz;
  v_tz text := 'Europe/Paris';
begin
  v_day_of_week := extract(dow from p_date);

  select open_time, close_time, slot_duration_minutes
    into v_open, v_close, v_duration
  from public.sanctuary_hours
  where sanctuary_id = p_sanctuary_id
    and day_of_week = v_day_of_week
    and active = true;

  if v_open is null then
    return; -- ferme ce jour
  end if;

  v_current := (p_date + v_open) at time zone v_tz;
  v_end := (p_date + v_close) at time zone v_tz;

  while v_current + make_interval(mins => v_duration) <= v_end loop
    slot_start := v_current;
    slot_end := v_current + make_interval(mins => v_duration);

    -- Verifie si le creneau est deja pris (paiement en cours OU confirme, dans les 30 dernieres min pour pending)
    available := not exists (
      select 1 from public.appointments a
      where a.sanctuary_id = p_sanctuary_id
        and a.status in ('confirmed', 'in_progress')
        and a.start_at < slot_end
        and (a.start_at + make_interval(mins => a.duration_minutes)) > slot_start
    ) and not exists (
      select 1 from public.appointments a
      where a.sanctuary_id = p_sanctuary_id
        and a.status = 'pending_payment'
        and a.created_at > now() - interval '30 minutes'
        and a.start_at < slot_end
        and (a.start_at + make_interval(mins => a.duration_minutes)) > slot_start
    );

    return next;
    v_current := v_current + make_interval(mins => v_duration);
  end loop;
end $$;

grant execute on function public.get_available_slots(uuid, date) to anon, authenticated;

-- 4. Fonction admin : dashboard RDV a venir
create or replace function public.upcoming_appointments()
returns table (
  id uuid,
  sanctuary_name text,
  client_prenom text,
  client_nom text,
  client_email text,
  client_phone text,
  start_at timestamptz,
  status text,
  price_total_eur numeric,
  paid_at timestamptz
) language sql stable as $$
  select a.id, s.nom, a.client_prenom, a.client_nom, a.client_email,
         a.client_phone, a.start_at, a.status, a.price_total_eur, a.paid_at
  from public.appointments a
  join public.sanctuaries s on s.id = a.sanctuary_id
  where a.status in ('pending_payment', 'confirmed', 'in_progress')
    and a.start_at >= now() - interval '2 hours'
  order by a.start_at;
$$;

grant execute on function public.upcoming_appointments() to authenticated;

select 'Migration RDV publics terminee ✦' as status;
