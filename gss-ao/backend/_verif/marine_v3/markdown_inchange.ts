/**
 * Marine v3 : le Markdown Marp des autres styles (« marine-v1 », graphite, conseil, sombre, premium) et du retour arrière
 * « gss-2026-09 » est identique, caractère pour caractère, à celui du générateur avant l'intégration de la v3 (copie de
 * src/ du commit de départ dans _avant_v3/, à extraire par « git archive HEAD gss-ao/backend/src »), sur les chapitres de référence (themes_fixtures.json).
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/marine_v3/markdown_inchange.ts
 */
import fs from 'fs';
import path from 'path';
import { MarpGenerator } from '../../src/generation/marp_generator';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Avant = require('../../_avant_v3/generation/marp_generator').MarpGenerator;

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '../themes_fixtures.json'), 'utf-8'));
const sortie = fs.mkdtempSync('/tmp/gss-md-');
let ko = 0;
for (const [apres, avant] of [['marine-v1', 'marine'], ['graphite', 'graphite'], ['conseil', 'conseil'], ['sombre', 'sombre'], ['premium', 'premium'], ['gss-2026-09', 'gss-2026-09']]) {
  const a = (new Avant(sortie) as any).buildMarkdown(fx.chapters, fx.cover, new Map(), new Map(), avant);
  const b = (new MarpGenerator(sortie) as any).buildMarkdown(fx.chapters, fx.cover, new Map(), new Map(), apres);
  // Les SVG (organigramme) viennent du moteur Python courant dans les deux cas (ancien générateur compris) : ils sont
  // contrôlés à part (v1_inchange.py) et retirés ici ; tout le reste du Markdown est comparé.
  const sansSvg = (t: string) => t.replace(/<svg\b[\s\S]*?<\/svg>/g, '<svg/>');
  const ok = sansSvg(a) === sansSvg(b);
  if (!ok) ko++;
  console.log(`${apres} : Markdown ${ok ? 'identique' : 'DIFFÉRENT'} (${b.length} caractères)`);
}
fs.rmSync(sortie, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
