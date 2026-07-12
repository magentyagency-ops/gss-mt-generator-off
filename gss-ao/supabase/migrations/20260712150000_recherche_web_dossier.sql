-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ticket #4 — Phase 2b (prépa) : lien dossier ↔ recherche web (public.recherche_web.dossier_id)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Permet à l'UI de lister « les recherches web de CE dossier ». Nullable (une recherche peut
-- exister hors dossier). FK vers public.dossiers si la table existe (ticket #2), on delete set null.

alter table public.recherche_web
  add column if not exists dossier_id uuid;

do $$
begin
  if to_regclass('public.dossiers') is not null then
    alter table public.recherche_web drop constraint if exists recherche_web_dossier_fk;
    alter table public.recherche_web
      add constraint recherche_web_dossier_fk
        foreign key (dossier_id) references public.dossiers(id) on delete set null;
  end if;
end$$;

create index if not exists idx_recherche_web_dossier on public.recherche_web(dossier_id);

comment on column public.recherche_web.dossier_id is
  'Dossier (appel d''offres) à l''origine de la recherche — pour l''affichage UI par dossier (phase 2b). Nullable.';
