# V1 — Validation finale (programmatique)

> Généré par `scripts/v1_final_validation.ts` (PizZip / OOXML). Date : 2026-06-14.

## Mode A — `v1_with_template.docx` (template refondu)

| Verdict | Assertion | Détail |
|---|---|---|
| ✅ OK | Ouverture ZIP sans erreur | 233 parts |
| ✅ OK | Fond gris `<w:background w:color="E5E5E5"/>` (insensible casse) | présent |
| ✅ OK | settings.xml `<w:displayBackgroundShape/>` | activé |
| ✅ OK | word/media/ contient ≥ 1 image (header/titre préservé) | 221 image(s) |
| ✅ OK | Titre / bandeau présent (`txbxContent`) | présent |
| ✅ OK | Taille > 100 Ko (sanity : design maître préservé) | 13539.8 Ko |

## Mode B — `v1_no_template.docx` (sans template, nu)

| Verdict | Assertion | Détail |
|---|---|---|
| ✅ OK | Ouverture ZIP sans erreur | 4 parts |
| ✅ OK | Aucun `<w:background>` (Mode B nu) | absent |
| ✅ OK | word/media/ vide ou inexistant | 0 image(s) |
| ✅ OK | Taille < 50 Ko (Mode B nu léger) | 2.5 Ko |

## Verdict structurel global : **OK ✅ (toutes assertions vertes)**


## Captures de rendu (Phase 2)

Générées via LibreOffice + pdftoppm (poppler) dans `data/output/v1_preview/final/` (gitignoré, local) :

| Fichier | Pages |
|---|---|
| `v1_with_template_page1.png`, `v1_with_template_page2.png` | Mode A (template refondu) — couverture maître + page suivante |
| `v1_no_template_page1.png` | Mode B (nu) — page unique |

> 3 captures (le Mode B nu tient sur **1 page** → pas de page 2).

## Tests + sécurité (Phase 3)

| Verdict | Contrôle | Détail |
|---|---|---|
| ✅ OK | Tests vitest | 6/6 verts (dont non-régression `{ refonte:false }`) |
| ✅ OK | `tsc --noEmit` | 0 erreur |
| ✅ OK | git status propre | aucun fichier généré tracké |
| ✅ OK | Scan secrets (`origin/feat/no-template..HEAD`) | aucun secret |

**Verdict Phase 1-3 : TOUT VERT ✅** — merge PR #4 autorisé.
