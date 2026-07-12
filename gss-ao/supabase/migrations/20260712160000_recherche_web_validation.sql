-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ticket #4 — Phase 2b : validation humaine des recherches web (public.recherche_web)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- L'UI liste les recherches « en_attente_validation » de MES dossiers et propose Valider/Rejeter.
-- La validation NE change QUE le statut : elle n'injecte RIEN dans le mémoire, ne modifie aucune
-- autre colonne. Garanties :
--   • RLS SELECT  : je vois les recherches de mes dossiers (dossier_id → dossiers.user_id).
--   • RLS UPDATE  : je peux mettre à jour une recherche de mes dossiers (owner uniquement).
--   • TRIGGER     : sur UPDATE, seule la colonne `statut` peut changer (sinon exception).
-- L'écriture initiale reste réservée au service_role (backend de confiance, contourne la RLS).

-- ── Lecture : recherches de MES dossiers ───────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.dossiers') is not null then
    drop policy if exists rw_select_dossier on public.recherche_web;
    create policy rw_select_dossier on public.recherche_web
      for select to authenticated using (
        dossier_id is not null
        and exists (
          select 1 from public.dossiers d
          where d.id = public.recherche_web.dossier_id
            and d.user_id = (select auth.uid())
        )
      );

    -- ── Mise à jour (statut) : sur MES dossiers uniquement ────────────────────────────────
    drop policy if exists rw_update_dossier on public.recherche_web;
    create policy rw_update_dossier on public.recherche_web
      for update to authenticated
      using (
        dossier_id is not null
        and exists (
          select 1 from public.dossiers d
          where d.id = public.recherche_web.dossier_id
            and d.user_id = (select auth.uid())
        )
      )
      with check (
        dossier_id is not null
        and exists (
          select 1 from public.dossiers d
          where d.id = public.recherche_web.dossier_id
            and d.user_id = (select auth.uid())
        )
      );
  end if;
end$$;

-- ── Garde-fou : un UPDATE ne peut modifier QUE `statut` ─────────────────────────────────────
-- (S'applique à tous, service_role compris ; le backend ne fait que des INSERT, jamais d'UPDATE
--  de contenu — seules les transitions de statut sont autorisées.)
create or replace function public.recherche_web_only_statut()
returns trigger language plpgsql as $$
begin
  if (new.query, new.answer, new.citations, new.model, new.cost_usd,
      new.sollicitation_id, new.dossier_id, new.created_at)
     is distinct from
     (old.query, old.answer, old.citations, old.model, old.cost_usd,
      old.sollicitation_id, old.dossier_id, old.created_at)
  then
    raise exception 'recherche_web : seule la colonne « statut » peut être modifiée (validation humaine).';
  end if;
  return new;
end$$;

drop trigger if exists trg_recherche_web_only_statut on public.recherche_web;
create trigger trg_recherche_web_only_statut
  before update on public.recherche_web
  for each row execute function public.recherche_web_only_statut();
