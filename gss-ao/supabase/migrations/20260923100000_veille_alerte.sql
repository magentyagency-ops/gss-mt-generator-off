-- ════════════════════════════════════════════════════════════════════════════════════════
-- Veille : stockage des alertes d'appels d'offres reçues par e-mail
-- ════════════════════════════════════════════════════════════════════════════════════════
-- La page Veille n'affichait jusqu'ici que deux e-mails écrits en dur dans le code : elle ne
-- pouvait donc pas se mettre à jour. Cette table est le chaînon manquant — l'endroit où les
-- alertes réellement reçues sont conservées.
--
-- PÉRIMÈTRE STRICT : cette migration est purement ADDITIVE. Elle CRÉE une table et rien
-- d'autre. Aucune table existante n'est modifiée, aucune policy existante n'est touchée,
-- aucune fonction existante n'est remplacée. Le reste du projet ne peut pas en être affecté.
--
-- ÉCRITURE RÉSERVÉE AU CANAL DE CONFIANCE : aucune policy d'INSERT, d'UPDATE ni de DELETE
-- n'est créée. Avec la RLS active, cela signifie qu'AUCUN utilisateur ne peut écrire dans
-- cette table, quel que soit son rôle applicatif. Seule la clé service_role — qui contourne
-- la RLS — le peut : c'est-à-dire l'Edge Function de réception et le backend. C'est la
-- garantie la plus forte contre une écriture non maîtrisée.
--
-- LECTURE PARTAGÉE, ET C'EST UN CHOIX : une alerte d'appel d'offres concerne l'entreprise,
-- pas un salarié en particulier. La lecture est donc ouverte à tout utilisateur authentifié,
-- sur le modèle EXACT de public.personne (l'annuaire partagé du ticket #11). La table
-- `organisations` aurait été une unité d'isolation plus fine, mais elle n'est pas appliquée
-- en production : ne pas en dépendre est délibéré.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.veille_alerte (
  id              uuid primary key default gen_random_uuid(),

  -- Identifiant attribué par le fournisseur d'e-mail. UNIQUE : un fournisseur peut livrer
  -- deux fois le même message, l'insertion en double est alors refusée par la base plutôt
  -- que de créer une alerte fantôme.
  message_id      text unique,

  expediteur      text not null check (char_length(expediteur) between 1 and 320),
  expediteur_nom  text,
  sujet           text not null default '',
  corps           text not null default '',
  recu_at         timestamptz not null default now(),

  -- recue   : stockée, jamais analysée (aucun appel au modèle n'a été consommé)
  -- analysee: le contenu a été analysé, le résultat est dans `parsed`
  -- traitee : un dossier a été créé à partir de cette alerte (cf. dossier_id)
  -- ignoree : écartée manuellement
  statut          text not null default 'recue'
                    check (statut in ('recue', 'analysee', 'traitee', 'ignoree')),

  -- Résultat de l'analyse, mis en cache. L'analyse coûte un appel au modèle : elle n'est
  -- déclenchée qu'à la demande et son résultat est conservé ici, pour n'être payé qu'une fois.
  parsed          jsonb,
  analysee_at     timestamptz,

  -- Dossier créé depuis cette alerte. `on delete set null` : supprimer un dossier ne doit
  -- jamais supprimer la trace de l'alerte qui lui a donné naissance.
  dossier_id      uuid references public.dossiers(id) on delete set null,

  created_at      timestamptz not null default now()
);

comment on table public.veille_alerte is
  'Alertes d''appels d''offres reçues par e-mail (veille). Écriture réservée au service_role ; lecture partagée entre utilisateurs authentifiés, comme public.personne.';
comment on column public.veille_alerte.message_id is
  'Identifiant du fournisseur d''e-mail. UNIQUE : protège des relivraisons du même message.';
comment on column public.veille_alerte.parsed is
  'Résultat d''analyse mis en cache. Évite de repayer un appel au modèle à chaque consultation.';

-- Listing par date de réception décroissante : l'écran de veille n'affiche rien d'autre.
create index if not exists idx_veille_alerte_recu on public.veille_alerte (recu_at desc);
create index if not exists idx_veille_alerte_statut on public.veille_alerte (statut);

-- ── RLS ────────────────────────────────────────────────────────────────────────────────
alter table public.veille_alerte enable row level security;

-- Lecture : tout utilisateur authentifié. Une alerte concerne l'entreprise entière.
drop policy if exists veille_alerte_select_authenticated on public.veille_alerte;
create policy veille_alerte_select_authenticated on public.veille_alerte
  for select to authenticated using (true);

-- AUCUNE policy d'écriture : volontaire. Voir l'en-tête. Toute écriture passe par le
-- service_role (Edge Function de réception, backend), jamais par le navigateur.
