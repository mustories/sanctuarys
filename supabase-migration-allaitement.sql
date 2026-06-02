-- =====================================================
-- SANCTUARYS · Migration · Champ allaitement sur club_signups
-- Les allaitantes sont accueillies, on doit le savoir pour adapter les plantes
-- =====================================================

alter table public.club_signups
  add column if not exists allaitement boolean default false;

comment on column public.club_signups.allaitement is 'TRUE si la fondatrice allaite au moment de son inscription (pour adapter protocoles + choix des plantes)';

select 'Champ allaitement ajouté ✦' as status;
