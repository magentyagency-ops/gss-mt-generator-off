# V1 — Audit du template DOCX et de l'architecture TypeScript

> Branche : `feat/v1-template-final` — Phase 1 (audit). Base : `feat/no-template` (b317206 « neW format MT »). Date : 2026-06-14.

## 1. Architecture identifiée

Le rewrite TypeScript vit dans [gss-ao/](../gss-ao/) :

| Sous-projet | Rôle | Stack |
|---|---|---|
| [gss-ao/backend](../gss-ao/backend) | Parseurs DCE, RAG, **génération du Mémoire Technique** | Express + TypeScript, `vitest` |
| [gss-ao/frontend](../gss-ao/frontend) | SaaS interne (Next.js), pilotage de la génération | Next 14 |

### Génération du Mémoire Technique — [memoire_generator.ts](../gss-ao/backend/src/generation/memoire_generator.ts)

Deux chaînes :

1. **Mode A — « avec cadre / template »** : `generate(dossierId)` — remplit un cadre `.docx` imposé par l'acheteur (détection de champs + remplissage IA).

2. **Mode B — « sans cadre imposé »** : `assembleFromSections()` / `exportFromSectionsMap()`.
   **Approche PRÉSERVATION** (format « neW format MT ») : on garde le maître `Template/Mémoire technique/AO RNE.docx` **intact** (design + 221 images) et on **duplique** des pages-modèles existantes (`cloneSpread`) pour y injecter le texte généré. Une page-modèle (« spread ») = une section avec image de fond pleine page (`<wp:anchor behindDoc="1">`) + zone de titre (`txbxContent`) suivie d'une section corps de texte. Le nom du client du maître est remplacé par celui du DCE (`adaptStaticText`).

### Librairies DOCX
| Lib | Usage |
|---|---|
| `pizzip` | ouverture/écriture du ZIP DOCX |
| `@xmldom/xmldom` | parse/sérialise `document.xml` (DOMParser/XMLSerializer) |
| `docxtemplater` (dép.) | non utilisé par le générateur Mode B |

### Routes API — [routes.ts](../gss-ao/backend/src/api/routes.ts)
`POST /generate` (Mode A), `POST .../assemble` et `POST /export-docx` → `exportFromSectionsMap` (Mode B).

## 2. Inventaire du template `Template/Mémoire technique/AO RNE.docx`

- **~18 Mo**, **233 entrées** dont **221 images** dans `word/media/`.
- `word/document.xml` = **5,0 Mo** (toute la maquette inline, 3 318 paragraphes).
- **Pas de fichier `word/header*.xml`** : l'identité visuelle est obtenue par des **images pleine page ancrées** (`behindDoc="1"`), pas par un `<w:background>`.
- **220 paragraphes** portent une image de fond pleine page ; **56** portent une zone de titre (`txbxContent`) ; **31** portent **les deux dans le même paragraphe** (image + titre groupés).

### Images clés (via `word/_rels/document.xml.rels`)
| rId | Fichier | Taille | Rôle |
|---|---|---|---|
| rId5 | `image1.png` | 2,25 Mo | Photo pleine page (cityscape Rouen) — fond de couverture |
| **rId6** | **`image2.png`** | 3 Ko | **Bandeau/logo « GSS » (titre) en haut de page** |
| rId7 | `image3.jpeg` | 86 Ko | Visuel bas de couverture |
| … | image4 → image221 | ~15 Mo | Photos / pictos décoratifs répétés sur les pages |

→ **Header/titre conservé = la zone de titre (`txbxContent`) + le bandeau du maître** ; ce sont les **images de fond pleine page des pages dupliquées** qui sont « inutiles » et doivent être retirées au profit d'un fond gris uniforme.

## 3. Stratégie (Phase 2)

**Stratégie A — manipulation directe ZIP + XML** (retenue ; cf. [V1_TEMPLATE_STRATEGY.md](V1_TEMPLATE_STRATEGY.md)). Le Mode B manipule déjà le DOM du maître → on reste dans ce paradigme.

### Plan d'action (sur `assembleFromSections` / `cloneSpread`)
1. **Fond gris uniforme** : injecter `<w:background w:color="E5E5E5"/>` (constante `BACKGROUND_COLOR`) + `<w:displayBackgroundShape/>` dans `settings.xml`.
2. **Conserver le bandeau d'en-tête + titre** : inhérent au format (cloneSpread préserve le `txbxContent` ; `setSectionHeading` y injecte le titre de section). ✅
3. **Retirer les images inutiles des pages dupliquées** : dans les pages clonées, supprimer les images de fond pleine page (`behindDoc`) **séparables du titre**, et forcer le texte en sombre (`DUP_TEXT_COLOR`) pour rester lisible sur le gris. Les images groupées avec le titre sont conservées (garde-fou anti-corruption).
4. **Builder « sans template »** (`assembleNoTemplate`) pour la comparaison.

### Garde-fous
- `refonte` est une **option** (`{ refonte: false }` restaure le comportement « neW format MT ») → **pas de régression** imposée.
- Fond gris casse le rendu → repli `#FFFFFF`. Suppression d'image risque de corrompre → on ne touche qu'aux images séparables, on signale.

> Note : **aucun test** préexistant dans le projet (`vitest` configuré, aucun `*.test.ts` hors `node_modules`). Les fichiers générés (`.docx`, `dossier-*.json`) sont **gitignorés**.
