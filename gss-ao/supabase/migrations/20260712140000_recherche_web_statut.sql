-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ticket #4 — Phase 2a : statut de validation des recherches web (public.recherche_web)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Une recherche stockée est « en attente de validation » : jamais injectée automatiquement
-- dans le dossier. La validation humaine (phase 2b) fera passer à 'validee' / 'rejetee'.

alter table public.recherche_web
  add column if not exists statut text not null default 'en_attente_validation'
    check (statut in ('en_attente_validation', 'validee', 'rejetee', 'injectee'));

comment on column public.recherche_web.statut is
  'Statut de validation : en_attente_validation (défaut, jamais injecté) → validee / rejetee / injectee (phase 2b).';

create index if not exists idx_recherche_web_statut on public.recherche_web(statut);
