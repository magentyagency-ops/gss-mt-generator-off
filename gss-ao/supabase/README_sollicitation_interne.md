# Feature « Sollicitation interne » — boucle e-mail (Ticket #3, spike)

Envoyer une **question interne** par e-mail à un membre de l'équipe, et **rattacher
automatiquement sa réponse** à la bonne question / au bon dossier (appel d'offres), sans
jamais risquer un mauvais rattachement (§15). Périmètre volontairement limité à **une
question**, boucle complète de bout en bout.

> **État (déployé sur le projet `GSS-MT-GENERATOR`, ref `azdtombjjnrglfzuqzzz`)** :
> - Edge Functions **déployées** : `send-question`, `inbound-email` (cf. §4 « État déployé »).
> - Migration #3 **appliquée** (table + RLS + Realtime) via l'API Management.
> - Test d'**isolation RLS par utilisateur** : **8/8 ✅** (transaction rollbackée, cf. `tests/rls_isolation_api.sql`).
> - Tests de rattachement (§15) : **24/24 ✅** (`tests/inbound_parse.test.mjs`).
> - Envoi **DRY-RUN** validé de bout en bout (statut → `envoyee`, Reply-To avec `question_id`).
> - **Reste** : brancher le fournisseur e-mail (domaine + clé) pour l'envoi réel + la réception.

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
| `user_id` | uuid FK → profiles | **propriétaire = responsable §11.8** ; isolation RLS §14 ; défaut `auth.uid()` |
| `ao_id` | uuid FK → **dossiers** | dossier (appel d'offres) concerné — vraie table du ticket #2 |
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

### Dépendance au ticket #2 (auth) — plus de stubs
La migration se BRANCHE sur le modèle d'auth réel (fusionné depuis `main`) :
`public.profiles`, `public.dossiers`, `public.is_admin()`, `public.set_updated_at()`.
Les anciens stubs `organisation` / `organisation_membre` / `appel_offres` ont été **supprimés**
(le modèle réel est **par utilisateur**, single-tenant GSS — pas multi-organisation).
**Prérequis** : appliquer `infra/supabase/001_schema.sql` + `003_app_compat.sql` AVANT cette migration.

Le gabarit §11 lit le dossier réel : `Nom du marché` = `dossiers.nom` (ou `contenu.objet`) ;
`Référence` = `contenu.reference` sinon un id court `AO-<8 hex>`.

---

## 3. Sécurité (§12/§14)

- **RLS stricte par utilisateur** : un utilisateur ne voit/écrit que **ses** questions
  (`auth.uid() = user_id`), avec override **admin** (`is_admin()`). `anon` = rien. Calquée sur
  `public.dossiers`. « Valider » (§11.8) est de fait réservé au **propriétaire** (responsable) / admin.
- **`send-question`** s'exécute avec le **JWT de l'utilisateur** → la RLS s'applique ;
  `user_id` = `auth.uid()` (défaut en base), jamais fourni par le client.
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

### État déployé (projet `GSS-MT-GENERATOR` / `azdtombjjnrglfzuqzzz`)
- **Edge Functions** (déployées via `--use-api`, sans Docker) :
  - `https://azdtombjjnrglfzuqzzz.functions.supabase.co/send-question`
  - `https://azdtombjjnrglfzuqzzz.functions.supabase.co/inbound-email` (`verify_jwt=false`)
- **Secrets posés** (via dashboard/CLI, Admin requis) : `INBOUND_EMAIL_DOMAIN` *(placeholder `ao.gss-domaine.fr` — à mettre à jour avec le vrai domaine)*, `INBOUND_WEBHOOK_SECRET`, `EMAIL_FROM` *(placeholder)*. `EMAIL_PROVIDER` **non défini** → **DRY-RUN**.
- **Secrets locaux (non commités)** : `supabase/.env.run.local` (token, DB password, anon, webhook secret) et `frontend/.env.local` — les deux gitignorés. Template : `supabase/.env.run.example`.

### Comptes/données de démo (persistants sur le projet)
- **Utilisateur démo** : `demo@gss.fr` / mot de passe `DemoGSS-2026` (compte jetable ; `role='user'`). Créé via l'API ; login vérifié.
- **Dossier démo** : « Marché de démonstration GSS » (`contenu.reference = AO-DEMO-01`), appartient au user démo.
- La table `question_interne` est **vide** (la question de test DRY-RUN a été supprimée).
- Pour rejouer la démo : se connecter en `demo@gss.fr`, aller sur `/sollicitations`, envoyer une question de test (DRY-RUN).

---

## 5. RUNBOOK — exécution (historique + reproductible)

> Objectif : **exécution sans réflexion**. Toutes les commandes se lancent depuis `gss-ao/`.
> CLI `supabase`, `node`, `npm` installés (Homebrew : `export PATH="/opt/homebrew/bin:$PATH"`).
> On travaille **directement sur le projet cloud** : PAS besoin de `supabase start` ni de Docker.
>
> **Deux voies selon les droits du token** (les secrets locaux sont dans `supabase/.env.run.local`) :
> - **Voie API (utilisée ici, sans mot de passe DB)** : migration + test RLS via
>   `POST https://api.supabase.com/v1/projects/<REF>/database/query` (Bearer `SUPABASE_ACCESS_TOKEN`).
>   Le deploy des functions marche avec un token **Developer** ; poser les **secrets** exige **Admin**.
> - **Voie CLI classique** : `supabase link` + `db push` (nécessite le **mot de passe DB**).

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

### Étape 2 — Appliquer le schéma d'auth (#2) PUIS la migration #3
Prérequis (une seule fois) : `infra/supabase/001_schema.sql` + `003_app_compat.sql` (dashboard → SQL editor).
```bash
ENVF=supabase/.env.run.local
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' $ENVF | cut -d= -f2-)
REF=$(grep '^SUPABASE_PROJECT_REF=' $ENVF | cut -d= -f2-)

# Voie API (utilisée ici — sans mot de passe DB) :
python3 -c "import json;print(json.dumps({'query':open('supabase/migrations/20260706120000_question_interne.sql').read()}))" \
  | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @-
# Voie CLI (alternative) : supabase link --project-ref $REF && supabase db push
# Vérifier : public.question_interne + policies qi_* (dashboard → Table editor).
```

### Étape 3 — TEST D'ISOLATION RLS (2 utilisateurs + admin) — le livrable clé §14
```bash
# Voie API (utilisée ici — sans mot de passe DB) : transaction rollbackée, 0 persistance.
python3 -c "import json;print(json.dumps({'query':open('supabase/tests/rls_isolation_api.sql').read()}))" \
  | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @-
# Attendu : 8 lignes pass=true (A/B isolés, A ne peut pas màj/insérer chez B, is_admin voit tout, anon rien).

# Voie Postgres directe (alternative — nécessite le mot de passe DB) :
#   SUPA_DB_HOST=db.$REF.supabase.co SUPA_DB_PORT=5432 SUPA_DB_USER=postgres \
#   SUPA_DB_PASSWORD=<DB_PASSWORD> SUPA_DB_NAME=postgres \
#   NODE_PATH="backend/node_modules" node supabase/tests/rls_isolation.cjs
```

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

### Étape 5 — Créer un utilisateur pour la démo UI
Dashboard → **Authentication → Add user** : créer `demo@gss.fr` / `<MDP>` (confirmer l'e-mail).
Le trigger `handle_new_user` (ticket #2) crée automatiquement son `public.profiles`.
Aucun seed d'organisation : le modèle est par utilisateur. Le **dossier de test** se crée
depuis l'UI (bouton « + Dossier de test »).

### Étape 6 — Lancer le front
```bash
npm install --prefix frontend            # déjà fait ; réinstalle si besoin
# frontend/.env.local doit contenir NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev --prefix frontend            # /sollicitations (port 3000, ou suivant si occupé)
```
Se connecter avec `demo@gss.fr` / `DemoGSS-2026`, sélectionner (ou créer via « + Dossier de
test ») un dossier, **envoyer une question** à une adresse à toi. En DRY-RUN le Reply-To
s'affiche (`ao+<question_id>@<domaine de repli>`) et le statut passe à **Envoyée** ; avec Postmark
branché, l'e-mail part réellement.

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
2. **Tableau de bord du fournisseur** — créer le **webhook entrant** vers `inbound-email`.
   **Authentification (précis) : ce n'est PAS du HMAC** — `inbound-email` vérifie un **secret
   partagé** (`INBOUND_WEBHOOK_SECRET`), accepté soit en **HTTP Basic Auth** (partie mot de passe),
   soit en en-tête `x-inbound-secret`. **Fail-closed** (pas de secret → 401). Le parser attend un
   POST **JSON au format Postmark inbound** (`MailboxHash`, `ToFull`, `FromFull`, `TextBody`).
   → **Postmark** convient sans modif ; URL du webhook avec Basic Auth :
   ```
   https://postmark:<INBOUND_WEBHOOK_SECRET>@azdtombjjnrglfzuqzzz.functions.supabase.co/inbound-email
   ```
   (le « postmark » avant `:` est arbitraire ; seul le mot de passe = le secret compte)
   ⚠️ Mailgun/SendGrid envoient du **form/multipart** (pas JSON) → nécessiteraient d'adapter le
   parser (et idéalement d'ajouter la vérif HMAC) — cf. §7.
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
- Validation §11.8 : aujourd'hui réservée au **propriétaire** du dossier (RLS `user_id`) / admin.
  Si un vrai rôle « responsable » distinct est voulu, l'ajouter dans `profiles` (ticket #2).
- Ajouter une **`reference` first-class** sur `public.dossiers` (aujourd'hui lue dans
  `contenu.reference`, sinon id court) si GSS veut une référence marché normée (ex. MP2026-08).
- Branchement de `backend/src/generation/missing_info_resolver.ts` (`requestInfoFromTeam`) sur
  cette boucle : c'est son point d'intégration naturel.
