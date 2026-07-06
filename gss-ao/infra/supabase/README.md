# Supabase — schéma & migrations

Ordre d'exécution dans l'éditeur SQL Supabase :

1. `001_schema.sql` — schéma complet **v4 "CRÈME"** (tables, arborescence,
   `fichiers`, `memoires_techniques` avec quota verrouillé par trigger, RLS,
   fonctions admin, **buckets `user-files` et `images-library` créés par le script**).
2. `003_app_compat.sql` — garantit les colonnes attendues par l'app
   (`dossiers.contenu jsonb`, `parent_id`, `memoires.titre/statut/ai_model`).
   Idempotent : sans effet si v4 a été exécutée à neuf.
3. **Premier admin** : crée ton compte via l'app, puis
   `update public.profiles set role = 'admin' where id = 'TON-UUID';`

> Quota : chaque **première** mémoire d'un dossier consomme 1 crédit
> (`generation_count++`) via le trigger `enforce_generation_quota`, et exige un
> email confirmé. Les régénérations d'un même dossier ne reconsomment pas.

## Connexion app ↔ Supabase

L'app utilise **uniquement l'`anon key`** (jamais `service_role`) : toute la sécurité
repose sur la **RLS**.

- Frontend (`@supabase/ssr`) : auth + session, protège les routes.
- Backend Express : vérifie le JWT puis exécute les requêtes **en tant que
  l'utilisateur** (client Supabase scoppé au token) → la RLS s'applique aussi côté serveur.

Variables à renseigner :

| Fichier | Variables |
|---|---|
| `frontend/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE` |
| `backend/.env` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |

Valeurs à copier depuis **Dashboard → Project Settings → API**
(`Project URL` et `anon public`).
