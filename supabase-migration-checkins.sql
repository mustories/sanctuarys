-- =====================================================
-- SANCTUARYS · Migration · Check-ins récurrents
-- Une Fondatrice peut faire un "point" à tout moment, plusieurs fois
-- Stocke réponses au questionnaire datées pour suivre l'évolution
-- =====================================================

create table if not exists public.member_check_ins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'point_evolution' check (type in ('premier_seuil', 'point_evolution')),
  data jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_member_check_ins_member on public.member_check_ins(member_id, created_at desc);

alter table public.member_check_ins enable row level security;

drop policy if exists "Check-ins: membre lit ses propres" on public.member_check_ins;
create policy "Check-ins: membre lit ses propres"
  on public.member_check_ins for select
  using (auth.uid() = member_id);

drop policy if exists "Check-ins: membre cree ses propres" on public.member_check_ins;
create policy "Check-ins: membre cree ses propres"
  on public.member_check_ins for insert
  with check (auth.uid() = member_id);

drop policy if exists "Check-ins: membre modifie ses propres" on public.member_check_ins;
create policy "Check-ins: membre modifie ses propres"
  on public.member_check_ins for update
  using (auth.uid() = member_id);

drop policy if exists "Check-ins: admin lit tous" on public.member_check_ins;
create policy "Check-ins: admin lit tous"
  on public.member_check_ins for select
  using (public.is_admin());

-- Ajoute welcomed_at sur profiles pour savoir si le mini-guide doit s'afficher
alter table public.profiles
  add column if not exists welcomed_at timestamptz;

comment on column public.profiles.welcomed_at is 'Date à laquelle la Fondatrice a vu son mini-guide d''accueil (NULL = pas encore)';

select 'Migration check-ins + welcomed_at ✦' as status;
