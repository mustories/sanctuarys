-- =====================================================
-- SANCTUARYS · Migration · Soins, Horaires, Réservations
-- Permet à Princesse de gérer son catalogue + horaires
-- Permet aux Fondatrices de réserver depuis leur espace
-- =====================================================

-- ============== 1. CATALOGUE DES SOINS ==============
create table if not exists public.treatment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  price_eur numeric(10,2) not null default 0,
  color_hex text default '#C8704D',
  active boolean not null default true,
  included_in_fondatrice_pass boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_treatment_types_active on public.treatment_types(active) where active = true;

alter table public.treatment_types enable row level security;

drop policy if exists "Soins: tout le monde lit" on public.treatment_types;
create policy "Soins: tout le monde lit"
  on public.treatment_types for select
  using (true);

drop policy if exists "Soins: admin modifie" on public.treatment_types;
create policy "Soins: admin modifie"
  on public.treatment_types for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============== 2. HORAIRES HEBDOMADAIRES ==============
create table if not exists public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6), -- 0=dimanche, 1=lundi, ..., 6=samedi
  open_time time not null,
  close_time time not null,
  slot_increment_minutes int not null default 15,
  buffer_minutes int not null default 15, -- pause entre deux soins
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(day_of_week, open_time)
);

alter table public.opening_hours enable row level security;

drop policy if exists "Horaires: tout le monde lit" on public.opening_hours;
create policy "Horaires: tout le monde lit"
  on public.opening_hours for select
  using (true);

drop policy if exists "Horaires: admin modifie" on public.opening_hours;
create policy "Horaires: admin modifie"
  on public.opening_hours for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============== 3. JOURS EXCEPTIONNELS ==============
create table if not exists public.availability_overrides (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('closed', 'special')),
  open_time time,
  close_time time,
  reason text,
  created_at timestamptz not null default now(),
  unique(date)
);

create index if not exists idx_availability_overrides_date on public.availability_overrides(date);

alter table public.availability_overrides enable row level security;

drop policy if exists "Exceptions: tout le monde lit" on public.availability_overrides;
create policy "Exceptions: tout le monde lit"
  on public.availability_overrides for select
  using (true);

drop policy if exists "Exceptions: admin modifie" on public.availability_overrides;
create policy "Exceptions: admin modifie"
  on public.availability_overrides for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============== 4. AJOUTS sur session_bookings (si pas deja la) ==============
alter table public.session_bookings
  add column if not exists treatment_type_id uuid references public.treatment_types(id),
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists notes text,
  add column if not exists status text default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled', 'no_show'));

create index if not exists idx_session_bookings_start on public.session_bookings(start_at);
create index if not exists idx_session_bookings_member on public.session_bookings(member_id, start_at desc);

-- Le membre peut creer et lire ses bookings
drop policy if exists "Bookings: membre lit ses propres" on public.session_bookings;
create policy "Bookings: membre lit ses propres"
  on public.session_bookings for select
  using (auth.uid() = member_id or public.is_admin());

drop policy if exists "Bookings: membre cree ses propres" on public.session_bookings;
create policy "Bookings: membre cree ses propres"
  on public.session_bookings for insert
  with check (auth.uid() = member_id);

drop policy if exists "Bookings: membre annule ses propres" on public.session_bookings;
create policy "Bookings: membre annule ses propres"
  on public.session_bookings for update
  using (auth.uid() = member_id or public.is_admin());

-- ============== 5. SOIN PAR DEFAUT : V-STEAM ==============
insert into public.treatment_types (name, slug, description, duration_minutes, price_eur, color_hex)
  values (
    'V-Steam',
    'v-steam',
    'Bain de vapeur vaginal aux plantes ancestrales, adapté à ton cycle et à tes besoins. Soin signature Sanctuarys.',
    50,
    120.00,
    '#C8704D'
  )
on conflict (slug) do nothing;

-- ============== 6. FONCTION : calculer creneaux disponibles ==============
-- Renvoie les créneaux libres pour une date et un soin donnés
create or replace function public.available_slots_for(
  p_date date,
  p_treatment_id uuid
) returns table (
  slot_start timestamptz,
  slot_end timestamptz
)
language plpgsql
security definer
as $$
declare
  v_duration int;
  v_buffer int := 15;
  v_increment int := 15;
  v_dow int;
  v_open time;
  v_close time;
  v_override record;
begin
  -- Recupere la duree du soin
  select duration_minutes into v_duration
  from public.treatment_types
  where id = p_treatment_id and active = true;

  if v_duration is null then
    return;
  end if;

  -- Verifie si la date a un override
  select * into v_override
  from public.availability_overrides
  where date = p_date;

  if v_override.type = 'closed' then
    return;
  end if;

  if v_override.type = 'special' and v_override.open_time is not null then
    v_open := v_override.open_time;
    v_close := v_override.close_time;
  else
    -- Horaires standards du jour
    v_dow := extract(dow from p_date)::int;
    select open_time, close_time, slot_increment_minutes, buffer_minutes
      into v_open, v_close, v_increment, v_buffer
    from public.opening_hours
    where day_of_week = v_dow and active = true
    limit 1;

    if v_open is null then
      return; -- jour ferme
    end if;
  end if;

  -- Genere les creneaux de v_open a v_close - v_duration
  return query
  with all_slots as (
    select generate_series(
      (p_date::timestamp + v_open)::timestamptz,
      (p_date::timestamp + v_close - (v_duration || ' minutes')::interval)::timestamptz,
      (v_increment || ' minutes')::interval
    ) as start_ts
  ),
  unavailable as (
    select start_at - (v_buffer || ' minutes')::interval as block_start,
           end_at + (v_buffer || ' minutes')::interval as block_end
    from public.session_bookings
    where date_trunc('day', start_at) = p_date::timestamp
      and status in ('confirmed', 'completed')
  )
  select
    s.start_ts as slot_start,
    (s.start_ts + (v_duration || ' minutes')::interval) as slot_end
  from all_slots s
  where not exists (
    select 1 from unavailable u
    where s.start_ts < u.block_end
      and s.start_ts + (v_duration || ' minutes')::interval > u.block_start
  )
  order by s.start_ts;
end;
$$;

grant execute on function public.available_slots_for(date, uuid) to authenticated, anon;

-- ============== 7. VUE ADMIN : agenda ==============
create or replace view public.admin_agenda as
select
  sb.id,
  sb.member_id,
  p.prenom,
  p.nom,
  p.email,
  p.phone,
  tt.name as treatment_name,
  tt.color_hex,
  sb.start_at,
  sb.end_at,
  sb.status,
  sb.notes
from public.session_bookings sb
left join public.profiles p on p.id = sb.member_id
left join public.treatment_types tt on tt.id = sb.treatment_type_id
order by sb.start_at;

grant select on public.admin_agenda to authenticated;

select 'Migration soins + horaires + agenda OK · V-Steam ajouté' as status;
