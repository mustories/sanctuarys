-- =====================================================
-- SANCTUARYS · Migration · Tracking relances automatiques
-- Permet à la fonction cron de savoir qui a déjà été relancée
-- =====================================================

alter table public.club_signups
  add column if not exists relance_count int not null default 0,
  add column if not exists last_relance_at timestamptz;

create index if not exists idx_club_signups_pending_relance
  on public.club_signups(status, last_relance_at)
  where status = 'pending';

comment on column public.club_signups.relance_count is 'Nombre de relances email automatiques envoyées';
comment on column public.club_signups.last_relance_at is 'Date de la dernière relance automatique';

-- Active pg_cron si pas déjà actif
create extension if not exists pg_cron;

-- Planifie la relance automatique tous les jours à 11h00 (heure Paris UTC+1)
-- Note : le cron tourne en UTC, donc 10h00 UTC = 11h00 Paris (en hiver) / 12h00 Paris (en été)
select cron.unschedule('relance-pending-fondatrices') where exists (select 1 from cron.job where jobname = 'relance-pending-fondatrices');

select cron.schedule(
  'relance-pending-fondatrices',
  '0 10 * * *',
  $$ select net.http_post(
    url := 'https://hcmcforwphmqrauqltqp.supabase.co/functions/v1/cron-relance-pending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ); $$
);

select 'Migration relance auto OK · Cron actif tous les jours 11h Paris ✦' as status;
