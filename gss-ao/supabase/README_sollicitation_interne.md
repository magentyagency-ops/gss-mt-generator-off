# Feature « Sollicitation interne » — boucle e-mail (Ticket #3, spike)

Envoyer une **question interne** par e-mail à un membre de l'équipe, et **rattacher
automatiquement sa réponse** à la bonne question / au bon dossier (appel d'offres), sans
jamais risquer un mauvais rattachement (§15). Périmètre volontairement limité à **une
question**, boucle complète de bout en bout.

> **État de ce spike** : code complet + tests de la logique de rattachement (§15) qui passent.
> Le test RLS local via `supabase start` n'a pas pu tourner ici (disque hôte saturé) →
> **à exécuter ce soir sur le projet Supabase de Clarence** (migration + test d'isolation +
> tests inbound). Tout est écrit et prêt.

---

## 1. Flux de bout en bout

```
  UI (/sollicitations)                Edge Function send-question              Fournisseur e-mail
  ─────────────────────               ───────────────────────────             ──────────────────
  Envoyer question de test  ─POST──▶  insert question_interne (RLS)
                                      statut → envoyee
                                      compose e-mail (gabarit §11)
                                      Reply-To: ao+<question_id>@<domaine> ───▶ e-mail au destinataire
                                                                                        │
  destinataire répond à l'e-mail  ◀───────────────────────────────────────────────────┘
        │
        ▼  (le fournisseur poste la réponse)
  Edge Function inbound-email  ◀─POST (webhook signé)─ Fournisseur (inbound parse)
        │  1. vérifie le secret (refuse si absent/invalide)
        │  2. extrait question_id : MailboxHash → ao+<id>@ → « Référence de suivi » du corps
        │  3. rattachement infaillible : id absent / inconnu / AMBIGU → ne rattache RIEN, log, 200
        ▼
  update question_interne : reponse_contenu, reponse_recue_at, statut → reponse_recue
        │  (JAMAIS de validation auto — §11.8)
        ▼
  UI (Realtime) : statut « Réponse reçue » + contenu → bouton « Valider » (responsable) → validee
```

---

## 2. Schéma de la table `question_interne` (§9)

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organisation_id` | uuid FK → organisation | isolation RLS §14 |
| `ao_id` | uuid FK → appel_offres | dossier concerné |
| `exigence_id` | text | id technique du critère DCE (nullable) |
| `critere_concerne` | text | libellé du critère (dans l'e-mail §11) |
| `question_id` | text UNIQUE | **clé de rattachement** `'q' + 16 hex` (64 bits, non devinable) |
| `destinataire_email` / `destinataire_nom` | text | paramètre d'entrée (pas de sélection auto) |
| `categorie` | text | §11.1 |
| `niveau_criticite` | text CHECK | `public\|interne\|deductible\|facultatif\|bloquant` (§11.1) |
| `contexte` | text | contexte minimal §11.3 |
| `question` | text | §11.4 |
| `date_limite` | date | §11.5 |
| `statut` | enum `question_statut` | `a_envoyer, envoyee, reponse_en_attente, reponse_recue, validee, bloquante` (§10) |
| `reponse_contenu` | text | rempli à la réception |
| `reponse_recue_at` | timestamptz | horodatage réception |
| `nb_relances` | int (défaut 0) | présent, **non automatisé** dans ce spike |
| `created_at` / `updated_at` | timestamptz | `updated_at` via trigger |

Enum en **slugs ASCII** ; libellés accentués mappés côté UI (`frontend/lib/sollicitations.ts`).

### Tables STUB (temporaires, à réconcilier)
- **`organisation` + `organisation_membre`** : support minimal de l'isolation multi-orga.
  Aucune auth n'existe encore → **à réconcilier avec le ticket #2 (authentification)**.
- **`appel_offres`** : les dossiers réels vivent dans le store JSON du backend Express
  (`backend/src/core/db.ts`). Stub minimal pour la FK + le gabarit e-mail → **à réconcilier**
  avec le store de dossiers réel.

---

## 3. Sécurité (§12/§14)

- **RLS stricte par organisation** : un utilisateur ne voit/écrit que les lignes de son
  organisation (`is_org_member()`, SECURITY DEFINER, anti-récursion). `anon` = rien.
- **`send-question`** s'exécute avec le **JWT de l'utilisateur** → la RLS s'applique ;
  `organisation_id` de la question est **dérivé de l'AO**, jamais du client.
- **`inbound-email`** est public mais **vérifie un secret partagé** (`INBOUND_WEBHOOK_SECRET`,
  en Basic Auth ou en-tête `x-inbound-secret`) — **fail-closed** (pas de secret → refus). Il
  utilise `service_role` (canal serveur de confiance) pour écrire ; l'infaillibilité vient de
  la logique (match exact du `question_id` UNIQUE, sinon rien).
- **Rattachement à deux niveaux (anti-ambiguïté §15)** : l'identifiant de **l'adresse de
  livraison** (MailboxHash / plus-address) fait autorité. Si deux adresses autoritatives
  diffèrent → **AMBIGU → aucun rattachement**. Le corps ne sert de repli que sans adresse
  exploitable (et ≥ 2 id distincts dans le corps → ambigu aussi). Prouvé par 24 tests unitaires
  (`inbound_parse.test.mjs`), dont tous les cas adverses.
- **`question_id` n'est PAS un secret d'auth.** Il rend le rattachement non ambigu et difficile
  à deviner. Le **filet anti-réponse forgée / usurpation = la validation humaine (§11.8)** :
  une réponse reçue reste `reponse_recue` jusqu'à validation par le responsable.
- **Secrets uniquement en env** — jamais en dur.

---

## 4. Variables d'environnement

### Secrets des Edge Functions (Supabase → `supabase secrets set` / dashboard)
| Variable | Rôle | Requis |
|---|---|---|
| `INBOUND_EMAIL_DOMAIN` | domaine du Reply-To `ao+<id>@<domaine>` (ex. `ao.gss-domaine.fr`) | oui |
| `INBOUND_WEBHOOK_SECRET` | secret partagé de vérification du webhook entrant | oui |
| `EMAIL_PROVIDER` | `postmark` ou absent/`none` (dry-run) | non |
| `EMAIL_FROM` | expéditeur (ex. `GSS AO <ao@ao.gss-domaine.fr>`) | si provider |
| `POSTMARK_SERVER_TOKEN` | token serveur Postmark | si postmark |
| `POSTMARK_MESSAGE_STREAM` | flux d'envoi (défaut `outbound`) | non |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement.

### Front (`frontend/.env.local`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (cf. `.env.local.example`).

---

## 5. RUNBOOK « CE SOIR » — exécution clé-en-main

> Objectif : **exécution sans réflexion**. Faire les étapes DANS L'ORDRE. Remplacer les
> `<placeholders>`. Toutes les commandes se lancent depuis `gss-ao/` (sauf mention).
> Le CLI `supabase`, `node`, `npm` sont déjà installés (via Homebrew : `export PATH="/opt/homebrew/bin:$PATH"`).
> On travaille **directement sur le projet cloud de Clarence** : PAS besoin de `supabase start`
> ni de Docker (le disque est saturé de toute façon).

### Ce qu'il faut avoir sous la main avant de commencer
- **Référence du projet** Supabase de Clarence : `<REF>` (dashboard → Project Settings → General).
- **Mot de passe base** : dashboard → Project Settings → Database → *Connection string* / *Database password* → `<DB_PASSWORD>`.
- **anon key** : Project Settings → API → `anon public` → `<ANON_KEY>`.
- Un **secret webhook** au choix, ex. généré par : `openssl rand -hex 24` → `<INBOUND_SECRET>`.

### Étape 1 — Se connecter et lier le projet
```bash
export PATH="/opt/homebrew/bin:$PATH"
cd "<...>/gss-ao"
supabase login                       # ouvre le navigateur (ou colle un access token)
supabase link --project-ref <REF>    # demande <DB_PASSWORD>
```

### Étape 2 — Appliquer la migration
```bash
supabase db push
# Attendu : applique supabase/migrations/20260706120000_question_interne.sql
# Vérifier : la table public.question_interne + les policies existent (dashboard → Table editor).
```

### Étape 3 — TEST D'ISOLATION RLS (2 organisations) — le livrable clé §14
Le test se connecte en direct à la base (port 5432) et se nettoie tout seul.
```bash
export SUPA_DB_HOST="db.<REF>.supabase.co"
export SUPA_DB_PORT=5432
export SUPA_DB_USER="postgres"
export SUPA_DB_PASSWORD="<DB_PASSWORD>"
export SUPA_DB_NAME="postgres"
NODE_PATH="backend/node_modules" node supabase/tests/rls_isolation.cjs
# Attendu : « TOUS LES TESTS PASSENT ✅ » (A ne voit que Org A, B que Org B, anon rien,
#           insertion/màj cross-org refusées).
```
> Si l'insert dans `auth.users` échoue (contrainte selon version) : voir §7 « Fast-follows » —
> ajouter les colonnes requises dans le seed du test. Peu probable sur Supabase récent.

### Étape 4 — Secrets des Edge Functions + déploiement
```bash
supabase secrets set \
  INBOUND_EMAIL_DOMAIN="ao.<domaine>" \
  INBOUND_WEBHOOK_SECRET="<INBOUND_SECRET>" \
  EMAIL_PROVIDER="postmark" \
  EMAIL_FROM="GSS AO <ao@ao.<domaine>>" \
  POSTMARK_SERVER_TOKEN="<POSTMARK_TOKEN>"     # si Postmark prêt ; sinon omettre EMAIL_PROVIDER → DRY-RUN

supabase functions deploy send-question
supabase functions deploy inbound-email        # verify_jwt=false (déjà dans config.toml)
# → URLs : https://<REF>.functions.supabase.co/send-question   et   /inbound-email
```

### Étape 5 — Créer un utilisateur + une organisation pour la démo UI
1. Dashboard → **Authentication → Add user** : créer `demo@gss.fr` / `<MDP>` (confirmer l'e-mail).
2. Dashboard → **SQL editor**, coller (remplacer `<USER_ID>` par l'id du user créé, visible dans Authentication) :
```sql
insert into public.organisation (id, nom)
values ('00000000-0000-0000-0000-0000000000a1', 'GSS (démo)');

insert into public.organisation_membre (organisation_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000a1', '<USER_ID>', 'responsable');
```
(L'appel d'offres de test se crée depuis l'UI via le bouton « + AO de test ».)

### Étape 6 — Lancer le front
```bash
npm install --prefix frontend            # installe @supabase/supabase-js (non fait ici : disque plein)
printf 'NEXT_PUBLIC_SUPABASE_URL=https://<REF>.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>\n' > frontend/.env.local
npm run dev --prefix frontend            # http://localhost:3000/sollicitations
```
Se connecter avec `demo@gss.fr`, créer un « AO de test », **envoyer une question** à une **vraie
adresse à toi**. En DRY-RUN, le Reply-To s'affiche ; avec Postmark branché, l'e-mail part.

### Étape 7 — Brancher Postmark (entrant) — cf. §6 étapes manuelles
Une fois les MX + le webhook inbound configurés (§6), **répondre à l'e-mail** reçu : la réponse
doit apparaître dans l'UI en **« Réponse reçue »** (temps réel), prête à **Valider**.

### Étape 8 — Tests d'intégration inbound (payloads simulés + adverses)
```bash
BASE_URL="https://<REF>.functions.supabase.co" \
INBOUND_SECRET="<INBOUND_SECRET>" \
QUESTION_ID="<question_id d'une question réelle>" \
QUESTION_ID2="<question_id d'une 2e question fraîche>" \
  ./supabase/tests/inbound_integration.sh
# Vérifie : attach, refus sans secret (401), id inconnu, sans référence, doublon,
#           JSON malformé (400), AMBIGU (2 adresses → ignored), attache via corps.
```

### Test « offline » (déjà vert, rappel — aucune base) — le cœur du risque §15
```bash
node supabase/tests/inbound_parse.test.mjs   # 24/24 ✅ (extraction id, cas adverses, secret)
```

---

## 6. Étapes MANUELLES (non automatisables — à faire avec Clarence)

1. **DNS / MX** — pointer un sous-domaine dédié (ex. `ao.<domaine>`) vers les serveurs
   entrants du fournisseur retenu (MX Postmark inbound / Mailgun / SendGrid). Le plus-addressing
   `ao+<question_id>@ao.<domaine>` doit arriver au fournisseur.
2. **Tableau de bord du fournisseur** — créer la **route/webhook entrant** vers
   `https://<REF>.functions.supabase.co/inbound-email`, et y attacher le secret
   (`INBOUND_WEBHOOK_SECRET`), soit en **Basic Auth** dans l'URL (`https://user:<secret>@…`),
   soit en en-tête `x-inbound-secret`.
3. **Déployer** les Edge Functions (cf. §5) et communiquer les URLs.
4. **À demander à Clarence** (dépendance §16) :
   - **quel fournisseur e-mail** (décision en attente) — recommandation : **Postmark**
     (Inbound Streams fiables). ⚠️ **Resend ne reçoit pas d'e-mail entrant** → à éviter.
   - le **Server Token / clés API** du fournisseur ;
   - un **domaine / sous-domaine dédié** (`ao.<domaine>`) + **accès DNS** pour les MX ;
   - confirmation de l'expéditeur `EMAIL_FROM`.

> Tant que le fournisseur n'est pas branché, `send-question` fonctionne en **DRY-RUN**
> (question créée, statut `envoyee`, e-mail composé loggé mais non envoyé) → la boucle est
> démontrable côté base/UI, et l'entrant se teste avec les payloads simulés.

---

## 7. Fast-follows (hors périmètre de ce spike, à noter)

- Regroupement de questions, relances automatiques (`nb_relances`), sélection auto de
  l'interlocuteur (annuaire GSS).
- Vérification **HMAC** de signature spécifique au fournisseur (Mailgun/SendGrid) en plus du
  secret partagé, une fois le fournisseur tranché.
- Restriction **DB-level** de la validation au rôle `responsable` (aujourd'hui : UI + RLS
  org-level ; la restriction fine est côté UI).
- Réconciliation des stubs `organisation`/`appel_offres` avec l'auth (#2) et le store dossiers.
- Branchement de `backend/src/generation/missing_info_resolver.ts` (`requestInfoFromTeam`) sur
  cette boucle : c'est son point d'intégration naturel.
