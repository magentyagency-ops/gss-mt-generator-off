-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ticket #4 — Traçabilité des recherches web (Perplexity) : table public.recherche_web
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Écrite par le backend de confiance (service_role, contourne la RLS). Lecture réservée :
-- admin (tout) ou utilisateur pour les recherches liées à SES sollicitations. anon = rien.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.recherche_web (
  id               uuid primary key default gen_random_uuid(),
  query            text not null,
  answer           text,
  citations        jsonb not null default '[]'::jsonb,   -- URLs sources (règle « 0 inventé » : ≥ 1)
  model            text,
  cost_usd         numeric,                               -- nullable (coût estimé de l'appel)
  sollicitation_id uuid,                                  -- FK nullable → question_interne (si présente)
  created_at       timestamptz not null default now()
);

comment on table public.recherche_web is
  'Ticket #4 : traçabilité des recherches web (Perplexity) — query, réponse, citations, modèle. Écrit par le backend de confiance (service_role).';

-- FK vers question_interne si la table existe (dépendance ticket #3) — sinon uuid libre.
do $$
begin
  if to_regclass('public.question_interne') is not null then
    alter table public.recherche_web
      drop constraint if exists recherche_web_sollicitation_fk;
    alter table public.recherche_web
      add constraint recherche_web_sollicitation_fk
        foreign key (sollicitation_id) references public.question_interne(id) on delete set null;
  end if;
end$$;

create index if not exists idx_recherche_web_sollicitation on public.recherche_web(sollicitation_id);
create index if not exists idx_recherche_web_created        on public.recherche_web(created_at desc);

-- ── RLS (cohérente avec les autres tables : per-user + override admin) ─────────────────────
alter table public.recherche_web enable row level security;

-- Lecture admin : tout (si la fonction is_admin() existe, ticket #2).
do $$
begin
  if to_regprocedure('public.is_admin()') is not null then
    drop policy if exists rw_select_admin on public.recherche_web;
    create policy rw_select_admin on public.recherche_web
      for select to authenticated using (public.is_admin());
  end if;
end$$;

-- Lecture user : recherches liées à SES sollicitations (si question_interne existe).
do $$
begin
  if to_regclass('public.question_interne') is not null then
    drop policy if exists rw_select_own on public.recherche_web;
    create policy rw_select_own on public.recherche_web
      for select to authenticated using (
        sollicitation_id is not null
        and exists (
          select 1 from public.question_interne q
          where q.id = public.recherche_web.sollicitation_id
            and q.user_id = (select auth.uid())
        )
      );
  end if;
end$$;

-- NB : aucune policy INSERT/UPDATE/DELETE pour `authenticated` → l'écriture est réservée au
--      `service_role` (backend de confiance), qui contourne la RLS. `anon` ne voit rien.
