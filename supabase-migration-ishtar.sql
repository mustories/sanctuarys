-- =====================================================
-- SANCTUARYS · Migration Ishtar (IA assistante)
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- 1. Table ishtar_summaries : résumés quotidiens des entrées de journal
create table if not exists public.ishtar_summaries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  journal_entry_id uuid references public.journal_entries(id) on delete cascade,
  module_number int,
  day_number int,
  summary text not null,
  alert_level text default 'none' check (alert_level in ('none', 'attention', 'urgent')),
  alert_message text,
  generated_by text default 'haiku',
  created_at timestamptz default now(),
  unique(journal_entry_id)
);

create index if not exists idx_ishtar_summaries_student on public.ishtar_summaries(student_id);
create index if not exists idx_ishtar_summaries_alerts on public.ishtar_summaries(alert_level) where alert_level != 'none';
create index if not exists idx_ishtar_summaries_created on public.ishtar_summaries(created_at desc);

-- 2. Table ishtar_bilans : bilans de fin de module
create table if not exists public.ishtar_bilans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  module_number int not null,
  content jsonb not null,
  generated_by text default 'sonnet',
  formatrice_validated boolean default false,
  formatrice_notes text,
  created_at timestamptz default now()
);

create index if not exists idx_ishtar_bilans_student on public.ishtar_bilans(student_id);

-- 3. RLS
alter table public.ishtar_summaries enable row level security;
alter table public.ishtar_bilans enable row level security;

drop policy if exists "Ishtar summaries: formatrice and admin" on public.ishtar_summaries;
create policy "Ishtar summaries: formatrice and admin"
  on public.ishtar_summaries for all
  using (public.can_view_student(student_id));

drop policy if exists "Ishtar bilans: formatrice and admin" on public.ishtar_bilans;
create policy "Ishtar bilans: formatrice and admin"
  on public.ishtar_bilans for all
  using (public.can_view_student(student_id));

-- 4. Realtime pour les alertes
alter publication supabase_realtime add table public.ishtar_summaries;

select 'Ishtar tables créées ✦' as status;
