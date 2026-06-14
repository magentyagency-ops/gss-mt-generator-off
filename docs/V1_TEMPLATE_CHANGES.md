# V1 — Changements du template (avant / après)

> Phase 2.6. Refonte du Mode B (`assembleFromSections` + `cloneSpread`) dans
> [memoire_generator.ts](../gss-ao/backend/src/generation/memoire_generator.ts).
> Format : préservation du maître AO RNE + refonte V1 (option `refonte`, activée par défaut).

## Avant / Après (sur les pages dupliquées)

| Aspect | Avant (« neW format MT ») | Après (refonte V1) |
|---|---|---|
| Fond des pages dupliquées | image de fond pleine page (photo décorative répétée) | **fond gris uniforme `#E5E5E5`** (image de fond retirée) |
| Couleur du texte | héritée du maître (claire, pensée pour fond sombre) | **texte sombre `#1A1A1A`** (lisible sur gris) |
| Bandeau d'en-tête / titre | conservé | **conservé** (inchangé) |
| Design maître (couverture, pages sources) | intact | **intact** (préservé) |
| Images de fond retirées | 0 | **8** sur l'échantillon (séparables du titre) |
| Affichage du fond | — | `<w:displayBackgroundShape/>` activé |

## Détail des modifications de code

1. **Constantes** : `BACKGROUND_COLOR = 'E5E5E5'`, `DUP_TEXT_COLOR = '1A1A1A'`.
2. **Helpers** :
   - `stripStandaloneBgImages(paras)` — retire les runs contenant une image de fond pleine page (`behindDoc`) **sans** zone de titre ; renvoie le nombre retiré.
   - `forceTextColor(paras, color)` — force la couleur de tous les runs textuels.
3. **`cloneSpread(..., refonte, stats)`** : si `refonte`, applique `stripStandaloneBgImages` + `forceTextColor` sur l'en-tête et le corps clonés.
4. **`assembleFromSections(dossierId, chapters, { refonte = true })`** :
   - injecte `<w:background w:color="E5E5E5"/>` + `displayBackgroundShape` ;
   - passe `refonte` + un compteur `stats` à `cloneSpread` ;
   - rapporte `images_fond_retirees` dans `generatedData`.
5. **`assembleNoTemplate(chapters)`** (nouveau) : DOCX nu reconstruit de zéro (sans maître, sans fond, sans en-tête) — base de comparaison.

## Vérification

- Tests : **6/6 verts** ([tests/template_refonte.test.ts](../gss-ao/backend/tests/template_refonte.test.ts)), dont un test de **non-régression** (`{ refonte: false }` → aucun fond injecté).
- Vérif structurelle : **10/10 assertions OK** ([V1_DOCX_STRUCTURE_CHECK.md](V1_DOCX_STRUCTURE_CHECK.md), via `scripts/verify_v1_docx.ts`).
- `tsc --noEmit` : 0 erreur.

## Captures (gitignorées : voir `docs/img/`)

- [Couverture maître préservée](img/v1_with_template_cover.png) — design intact, bandeau GSS.
- [Page dupliquée refondue](img/v1_with_template_refonte_page.png) — fond gris uniforme, image de fond retirée, titre conservé, texte sombre lisible.

## Échantillon

`data/output/v1_with_template.docx` (~13,5 Mo — le maître est préservé) et
`data/output/v1_no_template.docx` (~2,5 Ko, nu). **Gitignorés.**

> Limite assumée : sur les pages où l'image de fond et le titre sont groupés dans le même run
> (~31 cas), l'image est **conservée** pour ne pas casser le titre (garde-fou anti-corruption).
