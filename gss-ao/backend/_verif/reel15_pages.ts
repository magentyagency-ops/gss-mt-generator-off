/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — pages de texte par rubrique d'une génération réelle (JSON de _verif/gen.ts) :
 * découpage de la mise en page v2 (decouperPagesTexte) ; une rubrique de plus de 2 pages de texte est signalée
 * (consigne 3 et 6 : 1 à 2 pages d'explication, puis 1 page de schéma) ; sous-titre seul en bas ou seul sur sa page signalé.
 * Usage : npx ts-node --transpile-only _verif/reel15_pages.ts <fichier json> [...]
 */
import fs from 'fs';
import { decouperPagesTexte } from '../src/generation/marp_generator';
let defauts = 0;
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const sections: Record<string, string> = r.sections || {};
  const lignes: string[] = [];
  for (const [id, t] of Object.entries(sections)) {
    if (!String(t).trim()) continue;
    const pages = decouperPagesTexte(String(t).replace(/⟦AC:\d+⟧/g, ''));
    const seul = pages.some((p) => /^#{1,6}\s[^\n]*$/.test(p.trim()) || /\n#{1,6}\s[^\n]*$/.test(p.trim()));
    if (pages.length > 2 || seul) { defauts++; lignes.push(`  ${id} : ${pages.length} page(s)${seul ? ', sous-titre isolé' : ''}`); }
  }
  console.log(`${f} : ${Object.keys(sections).length} rubriques${lignes.length ? `\n${lignes.join('\n')}` : ', aucune rubrique de plus de 2 pages de texte'}`);
}
process.exit(defauts ? 1 : 0);
