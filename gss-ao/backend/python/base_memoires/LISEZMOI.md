# Base de mémoires GSS

Les réponses d'appels d'offres déjà rédigées par GSS, réutilisées par le générateur pour construire
les nouvelles réponses (contenu, structure, exemples, tableaux) au lieu de tout réinventer.

## Contenu

| Fichier | Rôle |
|---|---|
| `documents.json` | Liste des mémoires GSS : fichier, client, **date (AAAA-MM)**, type (`memoire` ou `cadre`) |
| `base_memoires.json` | Passages découpés (≈ 1 400 caractères), avec client, date, page, rubrique ; doublons fusionnés |
| `base_memoires.emb` | Index sémantique des passages (text-embedding-3-small, 1 536 dimensions, float32) |
| `registre_informations.json` | Registre des informations qui évoluent (effectifs, responsables, coordonnées, véhicules, logiciels, délais, certifications) : toutes les valeurs datées, la plus récente retenue, statut `confirmee` ou `a_confirmer` |

## Règle de fraîcheur des informations

1. Une réponse de l'équipe GSS (sollicitation, datée en base) prime sur tout le reste.
2. Sinon, la valeur **la plus récente** du registre est utilisée.
3. Si l'information a changé d'un mémoire à l'autre, ou si sa dernière source a plus de 12 mois,
   elle est utilisée **et** remontée à GSS dans les « consultations requises » pour confirmation.
   La réponse de l'équipe est enregistrée datée et prime aux générations suivantes.

## Ajouter un mémoire GSS

1. Placer le PDF de la réponse remise par GSS dans le dossier des sources.
2. Ajouter une ligne dans `documents.json` (client, date de remise `AAAA-MM`, type).
3. Reconstruire :

```bash
python3 python/base_memoires/construire_base.py <dossier_des_sources> python/base_memoires/base_memoires.json
npx ts-node src/rag/base_memoires_build.ts <dossier_des_sources>/../base_memoires_textes.json
```

Le premier script découpe et date les passages ; le second calcule l'index sémantique et le registre
(chaque valeur est extraite avec sa citation exacte, vérifiée dans le texte : aucune valeur inventée).
Aucune écriture en base de données : les fichiers sont versionnés et déployés avec le backend.
