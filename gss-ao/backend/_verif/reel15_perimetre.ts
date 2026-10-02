/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — génération réelle ign 15 : puces de couverture qui redisent une ligne du
 * tableau du périmètre du bloc 1 (sansRediteDuPerimetre), plafond de 2 pages de texte (plafonnerEngagementsPages) et pages de texte des rubriques (decouperPagesTexte).
 * Bloc 1 ramené à 2 pages de texte (reduireBesoinAPages).
 * Usage : npx ts-node --transpile-only _verif/reel15_perimetre.ts <fichier json>
 */
import fs from 'fs';
import { sansRediteDuPerimetre, plafonnerEngagementsPages, reduireBesoinAPages } from '../src/generation/reponse_libre_v2';
import { decouperPagesTexte } from '../src/generation/marp_generator';
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
const s: Record<string, string> = r.sections;
let ko = 0;
if (s.b1_comprehension) {
  const b = reduireBesoinAPages(s.b1_comprehension, (t) => decouperPagesTexte(t).length);
  if (b.retirees.length) console.log(`b1_comprehension : ${b.retirees.length} ligne(s) retirée(s) pour tenir en 2 pages\n${b.retirees.map((p) => `   - ${p.slice(0, 110)}`).join('\n')}`);
  s.b1_comprehension = b.texte;
}
for (const id of Object.keys(s)) {
  if (id === 'b1_comprehension') continue;
  const x = sansRediteDuPerimetre(s[id], s.b1_comprehension || '');
  if (x.retirees.length) console.log(`${id} : ${x.retirees.length} puce(s) retirée(s)\n${x.retirees.map((p) => `   - ${p.slice(0, 110)}`).join('\n')}`);
  s[id] = x.texte;
  const y = plafonnerEngagementsPages(s[id], (t) => decouperPagesTexte(t.replace(/⟦AC:\d+⟧/g, '')).length);
  if (y.retirees.length) console.log(`${id} : ${y.retirees.length} engagement(s) au-delà de 2 pages retiré(s)\n${y.retirees.map((p) => `   - ${p.slice(0, 110)}`).join('\n')}`);
  s[id] = y.texte;
}
for (const [id, t] of Object.entries(s)) {
  if (!t.trim()) continue;
  const n = decouperPagesTexte(t.replace(/⟦AC:\d+⟧/g, '')).length;
  if (n > 2) { ko++; console.log(`DÉFAUT ${id} : ${n} pages de texte`); }
}
console.log(ko ? `${ko} rubrique(s) de plus de 2 pages` : 'Toutes les rubriques tiennent en 1 à 2 pages de texte.');
process.exit(ko ? 1 : 0);
