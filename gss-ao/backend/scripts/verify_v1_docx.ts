/**
 * Phase 2 — Vérification programmatique des DOCX V1 (structure OOXML).
 * Ouvre les deux DOCX avec PizZip et assertionne la refonte (fond gris uniforme,
 * bandeau/titre conservé, design maître préservé) vs la génération nue (assertions inverses).
 *
 * Pré-requis : data/output/v1_with_template.docx et v1_no_template.docx générés
 * (scripts/gen_compare.ts). Usage :
 *   npx ts-node scripts/verify_v1_docx.ts > ../../docs/V1_DOCX_STRUCTURE_CHECK.md
 */
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';

const OUT_DIR = path.resolve(__dirname, '../../../data/output');
const WITH = path.join(OUT_DIR, 'v1_with_template.docx');
const NUDE = path.join(OUT_DIR, 'v1_no_template.docx');

interface Check { label: string; ok: boolean; detail: string; }

function inspect(file: string) {
  if (!fs.existsSync(file)) return { zip: null as PizZip | null, doc: '', settings: '', mediaCount: 0, error: 'fichier introuvable' };
  try {
    const zip = new PizZip(fs.readFileSync(file));
    const doc = zip.file('word/document.xml')?.asText() || '';
    const settings = zip.file('word/settings.xml')?.asText() || '';
    const mediaCount = Object.keys(zip.files).filter((n) => n.startsWith('word/media/')).length;
    return { zip, doc, settings, mediaCount, error: '' };
  } catch (e: any) {
    return { zip: null as PizZip | null, doc: '', settings: '', mediaCount: 0, error: e.message };
  }
}

function checkWith(): Check[] {
  const { zip, doc, settings, mediaCount, error } = inspect(WITH);
  if (!zip) return [{ label: 'Ouverture du DOCX', ok: false, detail: error || 'KO' }];
  const hasBg = /<w:background w:color="E5E5E5"/.test(doc);
  const hasTextbox = doc.includes('txbxContent');
  return [
    { label: 'Ouverture du DOCX (zip valide)', ok: true, detail: `${Object.keys(zip.files).length} parts` },
    { label: 'Fond gris uniforme `<w:background w:color="E5E5E5"/>`', ok: hasBg, detail: hasBg ? 'présent' : 'ABSENT' },
    { label: 'Affichage du fond `displayBackgroundShape`', ok: settings.includes('displayBackgroundShape'), detail: settings.includes('displayBackgroundShape') ? 'activé' : 'ABSENT' },
    { label: "Bandeau d'en-tête / titre conservé (`txbxContent`)", ok: hasTextbox, detail: hasTextbox ? 'présent' : 'ABSENT' },
    { label: 'Design maître préservé (médias présents)', ok: mediaCount > 0, detail: `${mediaCount} image(s) dans word/media/` },
  ];
}

function checkNude(): Check[] {
  const { zip, doc, settings, mediaCount, error } = inspect(NUDE);
  if (!zip) return [{ label: 'Ouverture du DOCX', ok: false, detail: error || 'KO' }];
  return [
    { label: 'Ouverture du DOCX (zip valide)', ok: true, detail: `${Object.keys(zip.files).length} parts` },
    { label: 'PAS de fond gris', ok: !doc.includes('<w:background'), detail: doc.includes('<w:background') ? 'fond présent (inattendu)' : 'aucun <w:background>' },
    { label: 'PAS de displayBackgroundShape', ok: !settings.includes('displayBackgroundShape'), detail: settings.includes('displayBackgroundShape') ? 'présent (inattendu)' : 'absent' },
    { label: 'PAS de bandeau / textbox', ok: !doc.includes('txbxContent'), detail: doc.includes('txbxContent') ? 'présent (inattendu)' : 'absent' },
    { label: 'Aucune image dans word/media/', ok: mediaCount === 0, detail: `${mediaCount} image(s)` },
  ];
}

function fmt(checks: Check[]): string {
  const rows = checks.map((c) => `| ${c.ok ? '✅ OK' : '❌ KO'} | ${c.label} | ${c.detail} |`).join('\n');
  return `| Verdict | Assertion | Détail |\n|---|---|---|\n${rows}`;
}

const w = checkWith();
const n = checkNude();
const allOk = [...w, ...n].every((c) => c.ok);
const sizeOf = (f: string) => (fs.existsSync(f) ? (fs.statSync(f).size / 1024).toFixed(1) + ' Ko' : 'absent');

console.log(`# V1 — Vérification programmatique de la structure des DOCX

> Phase 2 — généré par \`scripts/verify_v1_docx.ts\` (PizZip / OOXML). Date : 2026-06-14.
> Format : préservation du maître AO RNE.docx + refonte V1 (fond gris, images de fond
> retirées des pages dupliquées). Outputs gitignorés.

## Fichiers vérifiés
- \`data/output/v1_with_template.docx\` — ${sizeOf(WITH)} (Mode A, template refondu)
- \`data/output/v1_no_template.docx\` — ${sizeOf(NUDE)} (Mode B, nu)

## Mode A — template refondu (assertions de conformité)

${fmt(w)}

## Mode B — sans template (assertions inverses)

${fmt(n)}

## Verdict global

**Conformité à la commande tuteur : ${allOk ? 'OUI' : 'NON'}** — fond gris uniforme #E5E5E5 ${w[1]?.ok ? '✅' : '❌'}, bandeau d'en-tête / titre conservé ${w[3]?.ok ? '✅' : '❌'}, design maître préservé ${w[4]?.ok ? '✅' : '❌'}. Génération nue dépourvue de fond/bandeau/images comme attendu ${n.slice(1).every((c) => c.ok) ? '✅' : '❌'}.

> Note : le retrait des images de fond pleine page sur les pages dupliquées est rapporté
> par le générateur (\`generatedData.images_fond_retirees\`) à la génération, et n'opère
> que sur les images séparables du titre (garde-fou anti-corruption).
`);

process.exit(allOk ? 0 : 1);
