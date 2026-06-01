-- =====================================================
-- SANCTUARYS · Fix Écriture Élève
-- Restaure les capacités d'écriture des élèves : journal + messages
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- 1. Journal entries : policies séparées et explicites
drop policy if exists "Journal: own entries" on public.journal_entries;
drop policy if exists "Journal: student selects" on public.journal_entries;
drop policy if exists "Journal: student inserts" on public.journal_entries;
drop policy if exists "Journal: student updates" on public.journal_entries;
drop policy if exists "Journal: student deletes" on public.journal_entries;

create policy "Journal: student selects"
  on public.journal_entries for select
  using (student_id = auth.uid());

create policy "Journal: student inserts"
  on public.journal_entries for insert
  with check (student_id = auth.uid());

create policy "Journal: student updates"
  on public.journal_entries for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Journal: student deletes"
  on public.journal_entries for delete
  using (student_id = auth.uid());

-- Formatrice / admin lecture (déjà existante, on s'assure qu'elle est là)
drop policy if exists "Journal: formatrice reads her students" on public.journal_entries;
create policy "Journal: formatrice reads her students"
  on public.journal_entries for select
  using (public.can_view_student(student_id));

-- 2. Notes : policies séparées explicites
drop policy if exists "Notes: own" on public.notes;
drop policy if exists "Notes: student selects" on public.notes;
drop policy if exists "Notes: student inserts" on public.notes;
drop policy if exists "Notes: student updates" on public.notes;
drop policy if exists "Notes: student deletes" on public.notes;

create policy "Notes: student selects"
  on public.notes for select
  using (student_id = auth.uid());

create policy "Notes: student inserts"
  on public.notes for insert
  with check (student_id = auth.uid());

create policy "Notes: student updates"
  on public.notes for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Notes: student deletes"
  on public.notes for delete
  using (student_id = auth.uid());

drop policy if exists "Notes: formatrice reads her students" on public.notes;
create policy "Notes: formatrice reads her students"
  on public.notes for select
  using (public.can_view_student(student_id));

-- 3. Messages : on remet les 3 policies propres
drop policy if exists "Messages: see mine" on public.messages;
drop policy if exists "Messages: send mine" on public.messages;
drop policy if exists "Messages: mark read" on public.messages;
drop policy if exists "Messages: formatrice reads student messages" on public.messages;

-- Lecture : moi-même + formatrice qui peut voir l'élève
create policy "Messages: read access"
  on public.messages for select
  using (
    from_id = auth.uid()
    or to_id = auth.uid()
    or public.can_view_student(from_id)
    or public.can_view_student(to_id)
  );

-- Insert : je peux envoyer depuis moi-même
create policy "Messages: insert mine"
  on public.messages for insert
  with check (from_id = auth.uid());

-- Update : marquer lu si je suis le destinataire
create policy "Messages: mark read"
  on public.messages for update
  using (to_id = auth.uid())
  with check (to_id = auth.uid());

-- 4. Auto-assigne les élèves orphelines à l'admin si pas de formatrice
-- (évite que ADMIN soit null dans l'espace élève)
update public.profiles p
  set formatrice_id = (select id from public.profiles where role = 'admin' limit 1)
  where p.role = 'student'
  and p.formatrice_id is null;

-- 5. Profil élève : s'assurer que current_module et current_day sont définis
update public.profiles
  set current_module = coalesce(current_module, 2),
      current_day = coalesce(current_day, 1)
  where role = 'student'
  and (current_module is null or current_day is null);

select 'RLS fix élève appliqué ✦ Journal, notes, messages, assignation formatrice' as status;
