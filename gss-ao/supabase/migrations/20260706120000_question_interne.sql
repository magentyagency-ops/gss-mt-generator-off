-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ticket #3 — Feature/SendEmailForMoreInfo — Boucle e-mail « Sollicitation interne »
-- Migration : modèle de la question interne, BRANCHÉE sur le modèle d'auth réel (ticket #2).
-- ════════════════════════════════════════════════════════════════════════════════════════
-- PRÉREQUIS : le schéma d'auth du ticket #2 doit être appliqué AVANT cette migration
--   (gss-ao/infra/supabase/001_schema.sql + 003_app_compat.sql). Elle en dépend :
--     • public.profiles(id → auth.users)        — utilisateurs + rôle ('user' | 'admin')
--     • public.dossiers(id, user_id, nom, contenu jsonb)  — LE dossier (appel d'offres)
--     • public.is_admin()                        — override admin
--     • public.set_updated_at()                  — trigger updated_at (défini en 001)
--
-- Isolation (§14) : le modèle réel est PAR UTILISATEUR (single-tenant GSS), pas multi-organisation.
--   → la question interne est isolée par `user_id` (propriétaire = responsable de l'AO), avec
--     override `is_admin()`, exactement comme public.dossiers. On NE crée PLUS de tables
--     organisation/organisation_membre/appel_offres (elles étaient des stubs temporaires,
--     remplacés ici par le modèle réel — cf. ticket #2).
--
-- Inchangé (cœur pérenne) : `question_id` non devinable, enum de statut §10, colonnes de
-- réception, Realtime. La logique de rattachement (Edge Functions) n'est pas modifiée.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- pgcrypto : gen_random_bytes() pour l'identifiant non devinable. (Fourni par Supabase.)
create extension if not exists pgcrypto with schema extensions;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 1. Enum de statut (§10) — slugs ASCII (libellés accentués mappés côté UI)
-- ────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'question_statut') then
    create type public.question_statut as enum (
      'a_envoyer',
      'envoyee',
      'reponse_en_attente',
      'reponse_recue',
      'validee',
      'bloquante'
    );
  end if;
end$$;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 2. Génération de l'identifiant unique court, non devinable (§9 / clé du rattachement §15)
--    Format : 'q' + 16 hex (64 bits). Court, sûr pour plus-addressing ao+<id>@…
--    ⚠️  Pas un secret d'auth : le filet anti-réponse forgée est la VALIDATION HUMAINE (§11.8).
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_question_id()
returns text
language sql
volatile
as $$
  select 'q' || encode(extensions.gen_random_bytes(8), 'hex');
$$;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 3. Table centrale : question_interne (§9), rattachée à profiles + dossiers (modèle réel)
-- ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.question_interne (
  id                uuid primary key default gen_random_uuid(),

  -- Propriétaire = responsable de l'AO (§11.8). Isolation §14 (comme public.dossiers).
  user_id           uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- Dossier (appel d'offres) concerné — VRAIE table du ticket #2.
  ao_id             uuid not null references public.dossiers(id) on delete cascade,

  -- Critère du DCE que la question sert à compléter (§9)
  exigence_id       text,                          -- id technique du critère (nullable)
  critere_concerne  text not null,                 -- libellé lisible (utilisé dans l'e-mail §11)

  -- Identifiant unique court NON devinable : sert dans Reply-To (ao+<question_id>@…) et la
  -- « Référence de suivi » du corps. C'est LE point critique du rattachement (§15).
  question_id       text not null unique default public.generate_question_id(),

  -- Destinataire (paramètre d'entrée pour ce spike — pas de sélection auto §11)
  destinataire_email text not null,
  destinataire_nom   text,

  categorie         text,                          -- catégorie de la question (§11.1)
  -- Vocabulaire aligné au brief (§11.1). Slugs ASCII en base ; libellés accentués mappés côté UI.
  niveau_criticite  text not null default 'interne'
    check (niveau_criticite in ('public','interne','deductible','facultatif','bloquant')),

  contexte          text,                          -- contexte minimal (§11.3)
  question          text not null,                 -- texte de la question (§11.4)
  date_limite       date,                          -- date limite de réponse (§11.5)

  statut            public.question_statut not null default 'a_envoyer',

  reponse_contenu   text,                          -- rempli à la réception (§11 / Phase 3)
  reponse_recue_at  timestamptz,                   -- horodatage de la réception
  nb_relances       integer not null default 0,    -- champ présent, NON automatisé dans ce spike

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.question_interne.question_id is
  'Identifiant court non devinable (64 bits). Clé de rattachement infaillible : embarqué dans Reply-To ao+<question_id>@domaine et dans la Référence de suivi du corps. N''est PAS un secret d''auth : le filet anti-réponse forgée est la validation humaine §11.8.';
comment on column public.question_interne.user_id is
  'Propriétaire = responsable de l''AO (§11.8). Isolation par utilisateur (§14), aligné sur public.dossiers.';
comment on column public.question_interne.nb_relances is
  'Présent pour le modèle §9 mais NON automatisé dans ce spike (pas de relances auto).';

-- Index : lookup par question_id (réception), liste par dossier (UI Phase 4), par propriétaire.
create index if not exists idx_question_interne_question_id on public.question_interne(question_id);
create index if not exists idx_question_interne_ao          on public.question_interne(ao_id);
create index if not exists idx_question_interne_user        on public.question_interne(user_id);

-- updated_at auto (réutilise public.set_updated_at() défini par le ticket #2 / 001_schema.sql).
drop trigger if exists trg_question_interne_updated_at on public.question_interne;
create trigger trg_question_interne_updated_at
  before update on public.question_interne
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. RLS — ISOLATION PAR UTILISATEUR (§14), calquée sur public.dossiers + override admin
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Un utilisateur ne voit/écrit QUE ses propres questions ; un admin voit tout (is_admin()).
-- Le webhook entrant (Edge Function inbound-email) utilise la clé service_role qui contourne
-- la RLS de façon légitime (canal serveur authentifié par la signature du fournisseur) et fait
-- le rattachement par logique applicative infaillible. La RLS protège le canal UTILISATEUR.

alter table public.question_interne enable row level security;

drop policy if exists qi_select_own   on public.question_interne;
drop policy if exists qi_select_admin on public.question_interne;
drop policy if exists qi_insert_own   on public.question_interne;
drop policy if exists qi_update_own   on public.question_interne;
drop policy if exists qi_delete_own   on public.question_interne;
drop policy if exists qi_delete_admin on public.question_interne;

create policy qi_select_own on public.question_interne
  for select to authenticated using ((select auth.uid()) = user_id);
create policy qi_select_admin on public.question_interne
  for select to authenticated using (public.is_admin());

create policy qi_insert_own on public.question_interne
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy qi_update_own on public.question_interne
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy qi_delete_own on public.question_interne
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy qi_delete_admin on public.question_interne
  for delete to authenticated using (public.is_admin());

-- NB : aucune policy pour `anon` → un utilisateur non authentifié ne voit RIEN.
--      `service_role` (Edge Functions de confiance) contourne la RLS par conception.

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 5. Realtime : diffuser les changements de statut à l'UI (§12) — soumis à la RLS.
-- ────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'question_interne'
  ) then
    alter publication supabase_realtime add table public.question_interne;
  end if;
exception
  when undefined_object then
    null; -- publication absente (hors Supabase) : ignorer.
end$$;
