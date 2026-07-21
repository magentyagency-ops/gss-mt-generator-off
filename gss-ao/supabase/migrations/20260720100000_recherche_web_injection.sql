-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ticket #4 — Phase 3 : injection d'une recherche VALIDÉE dans le mémoire (public.recherche_web)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Deux colonnes additives (nullables — zéro régression) pour rendre l'injection SÛRE :
--
--   • champ_id       : id STABLE du champ dans le cadre (= descriptor.id, marqueur [CHAMP_<id>] du
--                      .docx temporaire). Remplace le lien fragile « recherche_web.query = label »
--                      (des libellés identiques — ex. cellules de tableau par site — collisionnent).
--                      L'injection ne ciblera QUE des lignes dont le champ_id est connu.
--
--   • valeur_retenue : valeur PROPRE saisie/confirmée par l'humain à la validation, réellement
--                      insérée dans le document. On n'injecte JAMAIS `answer` (prose Perplexity) :
--                      c'est le cœur de la règle anti-invention.
--
-- Rappel : l'écriture initiale reste au service_role. La mise à jour (statut + valeur_retenue) par le
-- propriétaire passe par la policy `rw_update_dossier` (migration 2b). Le trigger `recherche_web_only_statut`
-- ne garde que les colonnes de contenu d'origine : il n'entrave PAS la maj de valeur_retenue/champ_id.

alter table public.recherche_web
  add column if not exists champ_id integer;

alter table public.recherche_web
  add column if not exists valeur_retenue text;

comment on column public.recherche_web.champ_id is
  'Ticket #4 phase 3 : id stable du champ dans le cadre (descriptor.id / marqueur [CHAMP_<id>] du .docx temporaire). Cible univoque de l''injection. Nullable.';

comment on column public.recherche_web.valeur_retenue is
  'Ticket #4 phase 3 : valeur propre validée par l''humain, seule chose injectée dans le mémoire (jamais `answer` brut). Nullable tant que non validée.';
