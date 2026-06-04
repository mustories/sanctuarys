-- =====================================================
-- SANCTUARYS · Migration · Auto-sync Outlook toutes les 10 min
-- + Ajout colonne fondatrice_signup_id sur outlook_messages
-- =====================================================

-- 1. Ajoute une colonne pour lier un mail à une Fondatrice si on la connaît
alter table public.outlook_messages
  add column if not exists fondatrice_signup_id uuid references public.club_signups(id);

create index if not exists idx_outlook_messages_fondatrice
  on public.outlook_messages(fondatrice_signup_id)
  where fondatrice_signup_id is not null;

-- 2. Active pg_cron si pas déjà actif
create extension if not exists pg_cron;

-- 3. Désactive ancien job s'il existe
select cron.unschedule('outlook-auto-sync') where exists (select 1 from cron.job where jobname = 'outlook-auto-sync');

-- 4. Planifie la sync toutes les 10 minutes
select cron.schedule(
  'outlook-auto-sync',
  '*/10 * * * *',
  $$ select net.http_post(
    url := 'https://hcmcforwphmqrauqltqp.supabase.co/functions/v1/outlook-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ); $$
);

select 'Auto-sync Outlook actif toutes les 10 min ✦' as status;
