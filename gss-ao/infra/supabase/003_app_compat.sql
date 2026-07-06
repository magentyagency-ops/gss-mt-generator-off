-- ============================================================
-- MIGRATION 003 — Compatibilité application ↔ schéma v4 "CRÈME"
-- Idempotente : à exécuter APRÈS 001 (v4), sans risque de ré-exécution.
--
-- But : garantir les colonnes dont l'app a besoin, quel que soit l'état réel
-- de la base (v4 exécutée à neuf OU par-dessus l'ancien schéma v3, auquel cas
-- `create table if not exists` n'a rien modifié).
-- ============================================================

-- 1. dossiers.contenu : l'app stocke le dossier "riche" (acheteur, objet, lots,
--    critères, pièces, dce_files, memoire_sections…) dans ce jsonb.
alter table public.dossiers
  add column if not exists contenu jsonb not null default '{}'::jsonb;

create index if not exists dossiers_contenu_idx
  on public.dossiers using gin (contenu);

-- 2. dossiers.parent_id : présent en v4 fraîche ; ajouté ici si base ancienne.
alter table public.dossiers
  add column if not exists parent_id uuid
  references public.dossiers(id) on delete cascade;

create index if not exists dossiers_parent_idx on public.dossiers (parent_id);

-- 3. memoires_techniques : colonnes écrites par l'app (présentes en v4 fraîche).
--    Le type memo_status est créé par le script v4 (section 1).
alter table public.memoires_techniques
  add column if not exists titre text;

alter table public.memoires_techniques
  add column if not exists ai_model text;

alter table public.memoires_techniques
  add column if not exists statut public.memo_status not null default 'completed';
