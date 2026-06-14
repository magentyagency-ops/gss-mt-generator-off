# V1 — Vérification programmatique de la structure des DOCX

> Phase 2 — généré par `scripts/verify_v1_docx.ts` (PizZip / OOXML). Date : 2026-06-14.
> Format : préservation du maître AO RNE.docx + refonte V1 (fond gris, images de fond
> retirées des pages dupliquées). Outputs gitignorés.

## Fichiers vérifiés
- `data/output/v1_with_template.docx` — 13539.8 Ko (Mode A, template refondu)
- `data/output/v1_no_template.docx` — 2.5 Ko (Mode B, nu)

## Mode A — template refondu (assertions de conformité)

| Verdict | Assertion | Détail |
|---|---|---|
| ✅ OK | Ouverture du DOCX (zip valide) | 233 parts |
| ✅ OK | Fond gris uniforme `<w:background w:color="E5E5E5"/>` | présent |
| ✅ OK | Affichage du fond `displayBackgroundShape` | activé |
| ✅ OK | Bandeau d'en-tête / titre conservé (`txbxContent`) | présent |
| ✅ OK | Design maître préservé (médias présents) | 221 image(s) dans word/media/ |

## Mode B — sans template (assertions inverses)

| Verdict | Assertion | Détail |
|---|---|---|
| ✅ OK | Ouverture du DOCX (zip valide) | 4 parts |
| ✅ OK | PAS de fond gris | aucun <w:background> |
| ✅ OK | PAS de displayBackgroundShape | absent |
| ✅ OK | PAS de bandeau / textbox | absent |
| ✅ OK | Aucune image dans word/media/ | 0 image(s) |

## Verdict global

**Conformité à la commande tuteur : OUI** — fond gris uniforme #E5E5E5 ✅, bandeau d'en-tête / titre conservé ✅, design maître préservé ✅. Génération nue dépourvue de fond/bandeau/images comme attendu ✅.

> Note : le retrait des images de fond pleine page sur les pages dupliquées est rapporté
> par le générateur (`generatedData.images_fond_retirees`) à la génération, et n'opère
> que sur les images séparables du titre (garde-fou anti-corruption).

