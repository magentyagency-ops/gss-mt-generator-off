-- ════════════════════════════════════════════════════════════════════════════════════════
-- Recherche web : niveau de confiance de la source (0..1)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Le brief (§9 « Recherche web », §14) demande un niveau de confiance sur chaque résultat.
-- Colonne additive, nullable (rétro-compatible). Calculée par le backend à l'insertion.

alter table public.recherche_web
  add column if not exists niveau_confiance real;

comment on column public.recherche_web.niveau_confiance is
  'Confiance de la source (0..1). Calculée par le backend (nb de citations / cible configurable).';
