-- ════════════════════════════════════════════════════════════════════════════════════════
-- Isolation par ORGANISATION (brief §4 « données isolées par organisation »)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️  À REVOIR / TESTER AVANT APPLICATION EN PROD : cette migration change QUI VOIT QUOI
--     (un membre voit les dossiers de SON organisation, pas seulement les siens).
--     Elle est ADDITIVE et NON DESTRUCTIVE : les policies per-user existantes sont CONSERVÉES
--     (on AJOUTE seulement un accès « membre de l'organisation »). Rien n'est retiré, donc au
--     pire un utilisateur garde exactement l'accès actuel tant qu'aucune organisation n'existe.
--
-- Rien en dur : l'appartenance et les rôles vivent en base (tables ci-dessous), pas dans le code.

-- ── 1. Tables ──────────────────────────────────────────────────────────────────────────
create table if not exists public.organisations (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (char_length(nom) between 1 and 300),
  created_at  timestamptz not null default now()
);

create table if not exists public.membre_organisation (
  org_id      uuid not null references public.organisations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'membre' check (role in ('membre','admin')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists idx_membre_org_user on public.membre_organisation(user_id);

-- ── 2. Rattachement des dossiers à une organisation (nullable → rétro-compatible) ────────
alter table public.dossiers      add column if not exists org_id uuid references public.organisations(id) on delete set null;
alter table public.fichiers      add column if not exists org_id uuid references public.organisations(id) on delete set null;
alter table public.memoires_techniques add column if not exists org_id uuid references public.organisations(id) on delete set null;

-- ── 3. Helper : les organisations de l'utilisateur courant ──────────────────────────────
create or replace function public.mes_organisations()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.membre_organisation where user_id = (select auth.uid());
$$;

grant execute on function public.mes_organisations() to authenticated;

-- ── 4. RLS des nouvelles tables ─────────────────────────────────────────────────────────
alter table public.organisations       enable row level security;
alter table public.membre_organisation enable row level security;

drop policy if exists org_select_membre on public.organisations;
create policy org_select_membre on public.organisations
  for select to authenticated
  using (id in (select public.mes_organisations()));

drop policy if exists membre_select_self on public.membre_organisation;
create policy membre_select_self on public.membre_organisation
  for select to authenticated
  using (user_id = (select auth.uid()) or org_id in (select public.mes_organisations()));

-- ── 5. Accès ORGANISATION ajouté SUR LES TABLES MÉTIER (en plus du per-user existant) ────
-- NB : on n'ajoute que la LECTURE partagée à l'organisation ; l'écriture reste per-user
--      (le propriétaire), pour ne pas ouvrir la modification à tous les membres sans revue.
drop policy if exists dossiers_select_org on public.dossiers;
create policy dossiers_select_org on public.dossiers
  for select to authenticated
  using (org_id is not null and org_id in (select public.mes_organisations()));

drop policy if exists fichiers_select_org on public.fichiers;
create policy fichiers_select_org on public.fichiers
  for select to authenticated
  using (org_id is not null and org_id in (select public.mes_organisations()));

drop policy if exists memoires_select_org on public.memoires_techniques;
create policy memoires_select_org on public.memoires_techniques
  for select to authenticated
  using (org_id is not null and org_id in (select public.mes_organisations()));

-- ── 6. (à faire côté app, PAS ici) ──────────────────────────────────────────────────────
-- • Interface de gestion des organisations et des membres.
-- • Renseigner dossiers.org_id (et fichiers/memoires) à la création selon l'org de l'utilisateur.
-- • Décider si l'ÉCRITURE doit passer au niveau organisation (policies UPDATE/DELETE 'org').
-- Tant que ces étapes ne sont pas faites + testées, NE PAS appliquer cette migration en prod.
