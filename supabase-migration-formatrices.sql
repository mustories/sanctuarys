-- =====================================================
-- SANCTUARYS · Migration multi-formatrices
-- À exécuter dans Supabase SQL Editor APRÈS le schema initial
-- =====================================================

-- 1. Ajoute le rôle 'formatrice' à la contrainte
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'formatrice', 'admin'));

-- 2. Ajoute la colonne formatrice_id (la formatrice référente d'une élève)
alter table public.profiles
  add column if not exists formatrice_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_profiles_formatrice on public.profiles(formatrice_id);

-- 3. Fonctions helper
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_formatrice_or_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('formatrice', 'admin'));
$$;

create or replace function public.can_view_student(student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = student_id
    and (
      p.formatrice_id = auth.uid()
      or exists(select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
    )
  );
$$;

-- 4. Met à jour les policies de profiles pour multi-tenancy
drop policy if exists "Profiles: see own or admin" on public.profiles;
drop policy if exists "Profiles: update own or admin" on public.profiles;
drop policy if exists "Profiles: admin can insert" on public.profiles;
drop policy if exists "Profiles: admin can delete" on public.profiles;

-- Une élève voit son profil + sa formatrice référente
create policy "Profiles: see own + own formatrice"
  on public.profiles for select
  using (
    auth.uid() = id
    or (formatrice_id = auth.uid())  -- une formatrice voit ses élèves
    or (auth.uid() = (select formatrice_id from public.profiles where id = auth.uid()))  -- self-ref
    or public.is_admin()
  );

-- Plus simple : tout le monde voit son profil, formatrice voit ses élèves, admin voit tout, élève voit sa formatrice
drop policy if exists "Profiles: see own + own formatrice" on public.profiles;

create policy "Profiles: read access"
  on public.profiles for select
  using (
    auth.uid() = id
    or formatrice_id = auth.uid()  -- formatrice voit ses élèves
    or id = (select formatrice_id from public.profiles where id = auth.uid())  -- élève voit sa formatrice
    or public.is_admin()  -- admin voit tout
  );

create policy "Profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Profiles: admin updates all"
  on public.profiles for update
  using (public.is_admin());

create policy "Profiles: formatrice updates her students"
  on public.profiles for update
  using (formatrice_id = auth.uid());

-- 5. Update policies journal_entries
drop policy if exists "Journal: admin reads" on public.journal_entries;
drop policy if exists "Journal: formatrice reads her students" on public.journal_entries;

create policy "Journal: formatrice reads her students"
  on public.journal_entries for select
  using (public.can_view_student(student_id));

-- 6. Update policies notes
drop policy if exists "Notes: admin reads" on public.notes;
drop policy if exists "Notes: formatrice reads her students" on public.notes;

create policy "Notes: formatrice reads her students"
  on public.notes for select
  using (public.can_view_student(student_id));

-- 7. Update policies module_progress
drop policy if exists "Modules: admin all" on public.module_progress;
drop policy if exists "Modules: formatrice manages her students" on public.module_progress;

create policy "Modules: formatrice manages her students"
  on public.module_progress for all
  using (public.can_view_student(student_id));

-- 8. Messages : pas de changement structurel, les messages sont entre 2 user IDs
-- mais on s'assure que la formatrice voit tous les messages de ses élèves
drop policy if exists "Messages: formatrice reads student messages" on public.messages;
create policy "Messages: formatrice reads student messages"
  on public.messages for select
  using (
    from_id = auth.uid()
    or to_id = auth.uid()
    or public.can_view_student(from_id)
    or public.can_view_student(to_id)
  );

-- =====================================================
-- VÉRIFICATION
-- =====================================================
select 'Migration appliquée ✦' as status;
select policyname, tablename from pg_policies where schemaname = 'public' order by tablename, policyname;
