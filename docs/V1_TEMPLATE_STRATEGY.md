# V1 — Stratégie de refonte du template DOCX

> Phase 2.1. Branche : `feat/v1-template-final`. Base : format « neW format MT » (préservation).

## Décision : Stratégie A — manipulation directe ZIP + XML

On manipule le paquet OOXML du maître `Template/Mémoire technique/AO RNE.docx` via `pizzip`
(ZIP) + `@xmldom/xmldom` (DOM), plutôt que de reconstruire le document avec la lib `docx`.

### Pourquoi A plutôt que B

| Critère | Stratégie A (ZIP/XML) — **retenue** | Stratégie B (`docx` npm) |
|---|---|---|
| Fidélité à l'identité (styles, polices, images) | ✅ design maître préservé intégralement | ⚠️ à recréer, perte certaine |
| Complexité (5 Mo XML, 221 images, group shapes VML) | ✅ on duplique des pages existantes | ❌ reconstruction lourde |
| Cohérence avec l'existant | ✅ le Mode B (`assembleFromSections`/`cloneSpread`) manipule déjà le DOM du maître | ❌ paradigme différent |
| Risque de régression | ✅ refonte = **option** désactivable | ⚠️ remplace tout le pipeline |

### Concrètement (sur `assembleFromSections` + `cloneSpread`)

Le format de base (« neW format MT ») **préserve** le maître et **duplique** des pages-modèles
(`cloneSpread`) pour injecter le texte. La refonte V1 (`options.refonte`, **activée par défaut**)
ajoute trois traitements :

1. **Fond gris uniforme** : `<w:background w:color="E5E5E5"/>` (constante `BACKGROUND_COLOR`)
   inséré en 1er enfant de `<w:document>` + `<w:displayBackgroundShape/>` dans `word/settings.xml`.
2. **Bandeau d'en-tête + titre conservés** : inhérent au format. `cloneSpread` clone la zone
   de titre (`txbxContent`) et `setSectionHeading` y injecte le titre de section. ✅
3. **Images inutiles retirées des pages dupliquées** : `stripStandaloneBgImages` supprime, sur
   chaque page clonée, les images de fond pleine page (`<wp:anchor behindDoc="1">` porteuses
   d'un `<a:blip>`) **qui ne contiennent pas de zone de titre**. `forceTextColor` force le corps
   et le titre en `#1A1A1A` (`DUP_TEXT_COLOR`) pour rester lisible sur le gris.

### Limite assumée (garde-fou anti-corruption)
Sur ~31 pages, l'image de fond et la zone de titre sont **groupées dans le même run** ; les
retirer casserait le titre. Ces images-là sont **conservées** (le retrait n'opère que sur les
images séparables). Le compteur `images_fond_retirees` rapporte ce qui a été retiré.

### Garde-fous appliqués
- `{ refonte: false }` restaure exactement le comportement « neW format MT » → **pas de régression**.
- Fond gris casse le rendu → repli `#FFFFFF` (constante unique `BACKGROUND_COLOR`).
- Le Mode A (remplissage de cadre client) n'utilise pas ce chemin → non impacté.
