# Connexion Supabase — mise en route

Architecture retenue : **auth Supabase côté frontend + RLS appliquée partout**
(aucune clé `service_role`). Le backend Express vérifie le JWT de l'utilisateur
puis exécute les requêtes **en tant que cet utilisateur** → la RLS protège 100 %
des accès données.

```
Frontend (Next.js, @supabase/ssr)          Backend (Express)
  ├─ login / signup / session                ├─ vérifie le Bearer JWT (auth.getUser)
  ├─ middleware protège les routes           ├─ requêtes Supabase scoppées au token
  └─ apiFetch() → Authorization: Bearer …    └─ table public.dossiers (RLS)
                         │  HTTP + JWT  ▲
                         └──────────────┘
```

## 1. Base de données

Dans l'éditeur SQL Supabase (voir `infra/supabase/README.md`) :

1. Créer le bucket privé **`images-library`** (Storage).
2. Exécuter `infra/supabase/001_schema.sql` (déjà fait si ton schéma est en place).
3. Exécuter `infra/supabase/002_dossiers_contenu.sql` ← **nouveau, requis**
   (ajoute `dossiers.contenu jsonb` pour les données riches de l'app).

## 2. Variables d'environnement

Copier depuis **Dashboard → Project Settings → API** :

**`gss-ao/.env`** (backend)
```
SUPABASE_URL=https://TON-PROJET.supabase.co
SUPABASE_ANON_KEY=<anon public>
```

**`gss-ao/frontend/.env.local`**
```
NEXT_PUBLIC_SUPABASE_URL=https://TON-PROJET.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public>
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

## 3. Lancement

```bash
# Terminal 1 — backend
cd gss-ao/backend && npm run dev

# Terminal 2 — frontend
cd gss-ao/frontend && npm run dev
```

Puis : ouvrir http://localhost:3000 → redirigé vers **/login** → créer un compte
via **/signup** → confirmer l'email → se connecter.

## 4. Premier admin

Après avoir créé ton compte :
```sql
update public.profiles set role = 'admin' where id = 'TON-UUID';
```
(l'UUID est visible dans Authentication → Users).

## Ce qui a changé dans le code

| Zone | Changement |
|---|---|
| `backend/src/core/supabase.ts` | Client scoppé au JWT via `AsyncLocalStorage` + `verifyAccessToken` |
| `backend/src/api/authMiddleware.ts` | `requireAuth` sur toutes les routes `/api` (sauf `/health`, `/download`) |
| `backend/src/core/db.ts` | Stockage fichiers JSON → table Supabase `dossiers` (RLS, async) |
| `frontend/lib/supabase/*` | Clients navigateur/serveur + refresh de session (middleware) |
| `frontend/middleware.ts` | Protège les routes, redirige vers `/login` |
| `frontend/app/login`, `/signup`, `/auth/callback` | Flux d'authentification |
| `frontend/lib/api.ts` | `apiFetch()` : ajoute le `Authorization: Bearer` automatiquement |
| Pages dossiers/veille | `fetch(localhost:8000)` → `apiFetch()` ; ids dossiers en `crypto.randomUUID()` |

> Les fichiers générés (`/api/download`) restent servis sans auth car ils sont
> chargés dans des `<iframe>` / `<a download>` qui ne peuvent pas porter d'en-tête.

## Note (préexistant, hors périmètre)

`next build` échoue sur deux erreurs de typage **antérieures** à cette intégration
(chat `sender` dans `memoire/page.tsx`, union des emails démo dans `veille/page.tsx`).
Elles n'empêchent pas `next dev`. À corriger séparément avant un build de prod.
