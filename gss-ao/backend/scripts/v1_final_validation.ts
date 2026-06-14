/**
 * Validation finale V1 — vérification programmatique des 2 DOCX (PizZip / OOXML).
 * Mode A (template refondu, format préservation) : fond gris + design maître + titre.
 * Mode B (nu) : aucun fond, aucune image, fichier léger.
 *
 * Usage : npx ts-node scripts/v1_final_validation.ts > ../../docs/V1_FINAL_VALIDATION.md
 */
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';

const OUT_DIR = path.resolve(__dirname, '../../../data/output');
const WITH = path.join(OUT_DIR, 'v1_with_template.docx');
const NUDE = path.join(OUT_DIR, 'v1_no_template.docx');

interface Check { label: string; ok: boolean; detail: string; }

function load(file: string) {
  if (!fs.existsSync(file)) return { zip: null as PizZip | null, sizeKo: 0, error: 'fichier introuvable' };
  const sizeKo = fs.statSync(file).size / 1024;
  try {
    return { zip: new PizZip(fs.readFileSync(file)), sizeKo, error: '' };
  } catch (e: any) {
    return { zip: null as PizZip | null, sizeKo, error: e.message };
  }
}

function checkWith(): Check[] {
  const { zip, sizeKo, error } = load(WITH);
  if (!zip) return [{ label: 'Ouverture ZIP', ok: false, detail: error }];
  const doc = zip.file('word/document.xml')?.asText() || '';
  const settings = zip.file('word/settings.xml')?.asText() || '';
  const media = Object.keys(zip.files).filter((n) => n.startsWith('word/media/'));
  const hasBg = /<w:background w:color="e5e5e5"/i.test(doc);
  return [
    { label: 'Ouverture ZIP sans erreur', ok: true, detail: `${Object.keys(zip.files).length} parts` },
    { label: 'Fond gris `<w:background w:color="E5E5E5"/>` (insensible casse)', ok: hasBg, detail: hasBg ? 'présent' : 'ABSENT' },
    { label: 'settings.xml `<w:displayBackgroundShape/>`', ok: /displayBackgroundShape/.test(settings), detail: /displayBackgroundShape/.test(settings) ? 'activé' : 'ABSENT' },
    { label: 'word/media/ contient ≥ 1 image (header/titre préservé)', ok: media.length >= 1, detail: `${media.length} image(s)` },
    { label: 'Titre / bandeau présent (`txbxContent`)', ok: doc.includes('txbxContent'), detail: doc.includes('txbxContent') ? 'présent' : 'ABSENT' },
    { label: 'Taille > 100 Ko (sanity : design maître préservé)', ok: sizeKo > 100, detail: `${sizeKo.toFixed(1)} Ko` },
  ];
}

function checkNude(): Check[] {
  const { zip, sizeKo, error } = load(NUDE);
  if (!zip) return [{ label: 'Ouverture ZIP', ok: false, detail: error }];
  const doc = zip.file('word/document.xml')?.asText() || '';
  const media = Object.keys(zip.files).filter((n) => n.startsWith('word/media/'));
  return [
    { label: 'Ouverture ZIP sans erreur', ok: true, detail: `${Object.keys(zip.files).length} parts` },
    { label: 'Aucun `<w:background>` (Mode B nu)', ok: !doc.includes('<w:background'), detail: doc.includes('<w:background') ? 'présent (inattendu)' : 'absent' },
    { label: 'word/media/ vide ou inexistant', ok: media.length === 0, detail: `${media.length} image(s)` },
    { label: 'Taille < 50 Ko (Mode B nu léger)', ok: sizeKo < 50, detail: `${sizeKo.toFixed(1)} Ko` },
  ];
}

function fmt(checks: Check[]): string {
  return `| Verdict | Assertion | Détail |\n|---|---|---|\n` +
    checks.map((c) => `| ${c.ok ? '✅ OK' : '❌ KO'} | ${c.label} | ${c.detail} |`).join('\n');
}

const w = checkWith();
const n = checkNude();
const allOk = [...w, ...n].every((c) => c.ok);

console.log(`# V1 — Validation finale (programmatique)

> Généré par \`scripts/v1_final_validation.ts\` (PizZip / OOXML). Date : 2026-06-14.

## Mode A — \`v1_with_template.docx\` (template refondu)

${fmt(w)}

## Mode B — \`v1_no_template.docx\` (sans template, nu)

${fmt(n)}

## Verdict structurel global : **${allOk ? 'OK ✅ (toutes assertions vertes)' : 'KO ❌ (au moins une assertion en échec)'}**
`);

process.exit(allOk ? 0 : 1);
