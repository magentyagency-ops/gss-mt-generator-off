// Tour 2 (T2C-4) : hauteur estimée de chaque partie limitée en pages d'un cadre .docx déjà rempli (signets GSS_CH_n),
// à comparer au rendu Word. Usage : npx ts-node --transpile-only -P tsconfig.json _verif/t2c4_mesure.ts <fichier.docx>
// Sortie en échec (code 1) si une partie dépasse sa limite.
import fs from 'fs';
import PizZip from 'pizzip';
import { geometrieCadre, paragraphesCadre, hauteurPartie, partiesDuDocument } from '../src/generation/memoire_type_cadre';
const zip = new PizZip(fs.readFileSync(process.argv[2]));
const doc = zip.file('word/document.xml')!.asText();
const g = geometrieCadre(doc, zip.file('word/styles.xml')?.asText() || '');
const paras = paragraphesCadre(doc);
console.log(`géométrie : ${g.carParLigne} car./ligne, ligne ${g.lignePt} pt, page ${g.hauteurPt} pt`);
let ko = 0;
for (const p of partiesDuDocument(paras)) {
  const pages = hauteurPartie(paras, p.debut, p.fin, g) / g.hauteurPt;
  if (pages > p.pages) ko++;
  console.log(`${p.titre.slice(0, 50).padEnd(50)} ${p.section.slice(0, 30).padEnd(30)} ${pages.toFixed(2)} page(s)${pages > p.pages ? '  DÉPASSE' : ''}`);
}
process.exit(ko ? 1 : 0);
