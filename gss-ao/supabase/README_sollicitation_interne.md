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
        │  3. rattachement infaillible : id inconnu/absent → ne rattache RIEN, log, 200
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

## 5. Déploiement & tests

```bash
# 1. Lier le projet de Clarence
supabase link --project-ref <REF_PROJET_CLARENCE>

# 2. Appliquer la migration
supabase db push        # applique supabase/migrations/20260706120000_question_interne.sql

# 3. Définir les secrets
supabase secrets set INBOUND_EMAIL_DOMAIN=ao.<domaine> INBOUND_WEBHOOK_SECRET=<secret> \
                     EMAIL_PROVIDER=postmark EMAIL_FROM="GSS AO <ao@ao.<domaine>>" \
                     POSTMARK_SERVER_TOKEN=<token>

# 4. Déployer les Edge Functions
supabase functions deploy send-question
supabase functions deploy inbound-email   # verify_jwt=false (déjà dans config.toml)

# → URLs : https://<REF>.functions.supabase.co/send-question  et  /inbound-email
```

### Tests
```bash
# Logique de rattachement §15 (aucune base requise) — PASSE déjà :
node supabase/tests/inbound_parse.test.mjs

# Isolation RLS 2 organisations (base locale ou projet lié) :
#   supabase start   (local, ~3 Go d'images)  OU  contre la base liée
NODE_PATH="backend/node_modules" node supabase/tests/rls_isolation.cjs

# Intégration inbound (contre la fonction déployée / servie) :
BASE_URL="https://<REF>.functions.supabase.co" INBOUND_SECRET="<secret>" \
  QUESTION_ID="<un question_id réel>" ./supabase/tests/inbound_integration.sh
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
