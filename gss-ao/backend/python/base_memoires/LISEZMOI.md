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
4. Une réponse de GSS s'enregistre dans le registre comme une valeur datée portant `"reponse_gss": true`
   (ex. réponses du 1er octobre 2026, document `reponses_gss_2026-10-01.md`) : l'information est alors confirmée,
   et une reconstruction du registre la conserve. Une information marquée `"interne": true` (ex. `prix_horaire`)
   n'est jamais transmise à la rédaction ni écrite dans un mémoire.
5. La valeur d'une réponse de GSS prime même sur un mémoire plus récent. Sa source précise (« Réponse de GSS (1er
   octobre 2026) », « Attestation d'assurance RC Hiscox (fait à Paris le 24/09/2026) ») s'écrit dans `source_libelle`
   de la valeur ; une valeur rédigée à partir de la valeur sourcée (ex. `recours_sous_traitance`) s'écrit dans
   `valeur_retenue_imposee`. Ces champs sont conservés par une reconstruction : relancer
   `npx ts-node src/rag/base_memoires_build.ts --sans-index --consolider` redonne le registre versionné à l'identique.

## Corrections des anciens mémoires

Un fait d'un ancien mémoire corrigé par GSS (Peugeot 3008 → Peugeot 208 et Renault Zoé, 76 rue d'Elbeuf → 15 place de
la Verrerie, 02.35.89.09.92 → 09.62.21.24.75, délais de 20 ou 30 min → 45 min, J-15 → J-10) est inscrit dans
`corrections_passages.json` : document, page, ligne du texte extrait (`ancien`), ligne corrigée (`nouveau`) et source.
`construire_base.py` réapplique ces corrections à chaque reconstruction, aux passages comme aux textes intégraux qui
servent au registre ; le générateur les réapplique aussi au chargement de la base. Une nouvelle correction s'ajoute
dans ce fichier, puis `python3 python/base_memoires/construire_base.py --corriger python/base_memoires/base_memoires.json`
l'applique à la base existante (l'index sémantique n'a pas à être recalculé pour une correction d'une ligne).

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
