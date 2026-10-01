// Correction 2, bug C : sommaire des thèmes de la refonte — numérotation des rubriques sur les pages de suite.
import { MarpGenerator } from '../../src/generation/marp_generator';
const { Marp } = require('@marp-team/marp-core');
const ch = (key: string, n: number) => ({ key, title: `Bloc ${key}`, sections: Array.from({ length: n }, (_, i) => ({ id: `${key}_${i}`, title: `Rubrique ${key} ${i + 1}`, text: 'Texte.' })) });
let ko = 0;
for (const [nom, chapitres] of [['becquerel-like', [ch('I', 1), ch('II', 14), ch('III', 9), ch('IV', 18), ch('V', 17)]], ['chapitre de 35', [ch('I', 2), ch('II', 35)]]] as const) {
  const md: string = (new MarpGenerator('/tmp') as any).buildMarkdown(chapitres, { client: 'Client', title: 'Objet' }, new Map(), new Map(), 'marine');
  const toc = md.split('\n---\n').filter((p) => p.includes('## SOMMAIRE'));
  const html: string = new Marp({ html: true }).render(toc.join('\n---\n')).html;
  // Défaut : une rubrique (numéro > 1) collée en texte à la ligne du chapitre (« <br />9. »).
  const colle = /<br\s*\/?>\s*\d+\.\s/.test(html);
  const sousListes = (html.match(/<ol[^>]*>/g) || []).length;
  if (colle) ko++;
  console.log(`${colle ? 'KO' : 'OK'} ${nom} : ${toc.length} page(s) de sommaire, ${sousListes} listes ; ${(html.match(/<ol start="\d+">/g) || []).join(' ')}`);
}
console.log(ko ? `${ko} échec(s)` : 'tous conformes');
