-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ticket #3 — Feature/SendEmailForMoreInfo — Boucle e-mail « Sollicitation interne »
-- Migration : modèle de données de la question interne + isolation stricte par organisation (RLS)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Cette migration est conçue pour s'appliquer TELLE QUELLE sur le projet Supabase de Clarence
-- (aucun projet cloud créé de notre côté ; testée en local via `supabase start`).
--
-- ⚠️  STUBS TEMPORAIRES (à réconcilier plus tard) :
--   • `organisation` et `organisation_membre` : modèle minimal d'organisation + appartenance.
--     Il N'EXISTE PAS encore d'auth/organisation dans l'app (le ticket #2 « authentification »
--     fournira le vrai contrat). Ces tables sont le support MINIMUM pour prouver la RLS §14.
--     → À réconcilier avec le schéma d'auth du ticket #2 quand il sera figé.
--   • `appel_offres` : stub minimal. Aujourd'hui les dossiers (AO) vivent dans le stockage
--     JSON du backend Express (`backend/src/core/db.ts`), PAS dans Postgres. On crée ici un
--     support minimal pour (a) satisfaire la FK `question_interne.ao_id`, (b) fournir la
--     « Référence » et le « Nom du marché » du gabarit e-mail §11, (c) tester le rattachement
--     « au bon dossier ». → À réconcilier avec le store de dossiers réel.
--
-- Le cœur pérenne de cette migration = la table `question_interne`, l'enum de statut §10,
-- l'identifiant `question_id` non devinable, et les policies RLS. Les 2 stubs sont isolés et
-- documentés pour être remplacés sans toucher à `question_interne`.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- pgcrypto : gen_random_bytes() pour l'identifiant non devinable. (Fourni par Supabase.)
create extension if not exists pgcrypto with schema extensions;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 1. Organisation (STUB — à réconcilier avec l'auth du ticket #2)
-- ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.organisation (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  created_at  timestamptz not null default now()
);

comment on table public.organisation is
  'STUB temporaire (ticket #3). Support minimal de l''isolation multi-organisation pour la RLS. À réconcilier avec le modèle d''auth du ticket #2.';

-- Appartenance user → organisation. `user_id` référence auth.users (fourni par Supabase Auth).
create table if not exists public.organisation_membre (
  organisation_id  uuid not null references public.organisation(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null default 'membre',   -- 'membre' | 'responsable' (responsable = valide les réponses §11.8)
  created_at       timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

comment on table public.organisation_membre is
  'STUB temporaire (ticket #3). Lie un utilisateur Supabase Auth à une organisation. À réconcilier avec le ticket #2.';

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 2. Appel d'offres (STUB — les dossiers réels sont dans le store JSON du backend Express)
-- ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.appel_offres (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisation(id) on delete cascade,
  reference        text not null,          -- « Référence » lisible utilisée dans l'objet de l'e-mail (§11)
  nom_marche       text not null,          -- « Nom du marché » utilisé dans le corps de l'e-mail (§11)
  created_at       timestamptz not null default now()
);

comment on table public.appel_offres is
  'STUB temporaire (ticket #3). Support minimal d''un appel d''offres pour rattacher les questions et alimenter le gabarit e-mail. À réconcilier avec le store de dossiers réel (backend Express JSON).';

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 3. Enum de statut (§10) — valeurs EXACTES du ticket
-- ────────────────────────────────────────────────────────────────────────────────────────
-- Slugs ASCII en base (pas de valeurs accentuées). Les libellés accentués affichés
-- (« À envoyer », « Réponse reçue », …) sont mappés côté UI (frontend/lib).
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
-- 4. Génération de l'identifiant unique court, non devinable (§9 / clé du rattachement §15)
--    Format : 'q' + 16 hex (64 bits d'entropie). Court, sûr pour plus-addressing ao+<id>@…
--    ⚠️  Le question_id n'est PAS un secret d'authentification : il rend le rattachement
--        non ambigu et difficile à deviner, mais LE filet anti-réponse forgée / anti-usurpation
--        est la VALIDATION HUMAINE (§11.8) — une réponse reçue reste 'reponse_recue' jusqu'à
--        ce que le responsable la valide. Un id deviné n'injecte donc jamais rien sans revue.
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_question_id()
returns text
language sql
volatile
as $$
  select 'q' || encode(extensions.gen_random_bytes(8), 'hex');
$$;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 5. Table centrale : question_interne (§9)
-- ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.question_interne (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisation(id) on delete cascade,
  ao_id             uuid not null references public.appel_offres(id) on delete cascade,

  -- Critère du DCE que la question sert à compléter (§9)
  exigence_id       text,                         -- id technique du critère/exigence dans le DCE (nullable)
  critere_concerne  text not null,                -- libellé lisible du critère (utilisé dans l'e-mail §11)

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

  statut            public.question_statut not null default 'à_envoyer',

  reponse_contenu   text,                          -- rempli à la réception (§11 / Phase 3)
  reponse_recue_at  timestamptz,                   -- horodatage de la réception
  nb_relances       integer not null default 0,    -- champ présent, NON automatisé dans ce spike

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.question_interne.question_id is
  'Identifiant court non devinable (64 bits). Clé de rattachement infaillible : embarqué dans Reply-To ao+<question_id>@domaine et dans la Référence de suivi du corps. N''est PAS un secret d''auth : le filet anti-réponse forgée est la validation humaine §11.8.';
comment on column public.question_interne.nb_relances is
  'Présent pour le modèle §9 mais NON automatisé dans ce spike (pas de relances auto).';

-- Index utiles : lookup par question_id (réception) et liste par dossier (UI Phase 4).
create index if not exists idx_question_interne_question_id on public.question_interne(question_id);
create index if not exists idx_question_interne_ao          on public.question_interne(ao_id);
create index if not exists idx_question_interne_org         on public.question_interne(organisation_id);

-- updated_at auto
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_question_interne_updated_at on public.question_interne;
create trigger trg_question_interne_updated_at
  before update on public.question_interne
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 6. RLS — ISOLATION STRICTE PAR ORGANISATION (§14 : « données isolées par organisation »)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Modèle : un utilisateur ne voit/écrit QUE les lignes de SON organisation. Le webhook entrant
-- (Edge Function inbound-email) utilise la clé service_role qui contourne la RLS de façon
-- légitime (canal serveur de confiance, authentifié par la signature du fournisseur) et fait
-- le rattachement par logique applicative infaillible. La RLS protège le canal UTILISATEUR.

-- Helper SECURITY DEFINER : teste l'appartenance sans déclencher la RLS de organisation_membre
-- (évite la récursion de policy). search_path verrouillé (sécurité).
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_membre m
    where m.organisation_id = org
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;

alter table public.organisation        enable row level security;
alter table public.organisation_membre enable row level security;
alter table public.appel_offres        enable row level security;
alter table public.question_interne    enable row level security;

-- ── organisation : un membre voit son organisation ─────────────────────────────────────
drop policy if exists org_select on public.organisation;
create policy org_select on public.organisation
  for select to authenticated
  using (public.is_org_member(id));

-- ── organisation_membre : un utilisateur voit ses propres appartenances ────────────────
drop policy if exists org_membre_select on public.organisation_membre;
create policy org_membre_select on public.organisation_membre
  for select to authenticated
  using (user_id = auth.uid());

-- ── appel_offres : accès limité à l'organisation ───────────────────────────────────────
drop policy if exists ao_select on public.appel_offres;
create policy ao_select on public.appel_offres
  for select to authenticated
  using (public.is_org_member(organisation_id));

drop policy if exists ao_insert on public.appel_offres;
create policy ao_insert on public.appel_offres
  for insert to authenticated
  with check (public.is_org_member(organisation_id));

-- ── question_interne : SELECT / INSERT / UPDATE / DELETE strictement intra-organisation ─
drop policy if exists qi_select on public.question_interne;
create policy qi_select on public.question_interne
  for select to authenticated
  using (public.is_org_member(organisation_id));

drop policy if exists qi_insert on public.question_interne;
create policy qi_insert on public.question_interne
  for insert to authenticated
  with check (public.is_org_member(organisation_id));

drop policy if exists qi_update on public.question_interne;
create policy qi_update on public.question_interne
  for update to authenticated
  using (public.is_org_member(organisation_id))
  with check (public.is_org_member(organisation_id));

drop policy if exists qi_delete on public.question_interne;
create policy qi_delete on public.question_interne
  for delete to authenticated
  using (public.is_org_member(organisation_id));

-- NB : aucune policy pour le rôle `anon` → un utilisateur non authentifié ne voit RIEN.
--      Le rôle `service_role` (Edge Functions de confiance) contourne la RLS par conception.

-- ────────────────────────────────────────────────────────────────────────────────────────
-- 7. Realtime : diffuser les changements de statut à l'UI (§12 « statut en temps réel »)
--    La diffusion reste soumise à la RLS (chaque client ne reçoit que ses lignes).
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
    -- publication supabase_realtime absente (hors Supabase) : ignorer.
    null;
end$$;
