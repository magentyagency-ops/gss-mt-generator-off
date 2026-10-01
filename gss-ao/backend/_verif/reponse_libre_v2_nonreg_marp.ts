/**
 * Non-régression du rendu v1 : Markdown Marp produit par marp_generator.ts avant (copie de HEAD) et après les
 * changements de la réponse libre v2, sur des chapitres v1 (sans les nouvelles propriétés), dans les deux thèmes.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/reponse_libre_v2_nonreg_marp.ts <copie de l'ancien fichier>
 */
import fs from 'fs';
import path from 'path';
import { MarpGenerator } from '../src/generation/marp_generator';
const ancien = require(path.resolve(process.argv[2]));
const ref = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-becquerel-11.json'), 'utf-8'));
const CH: Record<string, string> = { I: 'Présentation de notre structure', II: 'Les moyens humains', III: 'Les moyens opérationnels', IV: 'Les moyens organisationnels' };
const ids = Object.keys(ref.sections);
const parCh: Record<string, string[]> = { I: ids.slice(0, 4), II: ids.slice(4, 10), III: ids.slice(10, 15), IV: ids.slice(15) };
const chapitres = () => Object.entries(parCh).map(([k, l]) => ({ key: k, title: CH[k], sections: l.map((id) => ({ id, title: id, text: String(ref.sections[id]).replace(/⟦AC:\d+⟧/g, '') })) }));
let ecarts = 0;
for (const theme of ['gss-2026-09', 'marine']) {
  const schemas = new Map<string, string>([['0_0_0', '<svg width="1200" height="660"><rect/></svg>'], ['1_1_0', '<svg width="1200" height="660"><circle/></svg>']]);
  const a = (new ancien.MarpGenerator('/tmp') as any).buildMarkdown(chapitres(), { client: 'Client', title: 'Objet' }, new Map(), schemas, theme);
  const b = (new MarpGenerator('/tmp') as any).buildMarkdown(chapitres(), { client: 'Client', title: 'Objet' }, new Map(), schemas, theme);
  const ok = a === b;
  if (!ok) ecarts++;
  console.log(`${theme} : Markdown v1 ${ok ? 'IDENTIQUE' : 'DIFFÉRENT'} (${a.length} car.)`);
  const ea = MarpGenerator.enumerateContentSlides(chapitres() as any, theme).map((s) => s.key).join(',');
  const eb = ancien.MarpGenerator.enumerateContentSlides(chapitres(), theme).map((s: any) => s.key).join(',');
  console.log(`${theme} : pages de contenu ${ea === eb ? 'identiques' : 'DIFFÉRENTES'} (${ea.split(',').length})`);
  if (ea !== eb) ecarts++;
}
process.exit(ecarts ? 1 : 0);
