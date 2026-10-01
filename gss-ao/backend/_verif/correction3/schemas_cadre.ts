// Correction 3 : schémas du mémoire type dans le cadre (sans appel au modèle).
//  - chaque rubrique à schéma de bibliothèque : son schéma est bien retenu par choisir (y compris II-TEN-01) ;
//  - chaque rubrique à schéma « spec » : dessiné au thème, toile paysage, contrôlé sur le texte publiposté de la rubrique
//    (comme dans le cadre, sur la réponse reprise), puis retenu par choisir avant la recherche par mots.
// Usage : npx ts-node --transpile-only -P tsconfig.json _verif/correction3/schemas_cadre.ts
import path from 'path';
const B = path.resolve(__dirname, '../..');
const mtm = require(path.join(B, 'src/generation/memoire_type'));
const cm = require(path.join(B, 'src/generation/memoire_type_cadre'));
const { choisir } = require(path.join(B, 'src/generation/visuels_cadre'));
const { dessinerSpecs } = require(path.join(B, 'src/generation/schema_service'));
const { themeActif } = require(path.join(B, 'src/generation/themes'));
(async () => {
  const mt = mtm.chargerMemoireType();
  const prep = mtm.preparerMemoireType({ analyse: { clientName: 'Ville de Test' }, dce: '', cover: {}, referents: '', horsNormandie: false }, { memoireType: mt });
  const publiees = mtm.publierMemoire(prep);
  const theme = themeActif();
  console.log('thème actif', theme);
  // Bibliothèque
  const biblio = mt.rubriques.filter((r: any) => r.schema?.source === 'bibliotheque' && r.ancienne_rubrique !== 'b_references');
  const out = choisir(biblio.map((r: any, i: number) => ({ cle: `k${i}`, question: 'xx', texte: 'yy', prefere: r.schema.ref })), theme);
  const manquants = biblio.filter((r: any) => !out.some((o: any) => o.id === r.schema.ref)).map((r: any) => `${r.id}:${r.schema.ref}`);
  console.log(`bibliothèque : ${out.length}/${biblio.length} retenus ; manquants : ${manquants.join(', ') || 'aucun'} ; II-TEN-01 ${out.some((o: any) => o.id === 'II-TEN-01') ? 'retenu' : 'ABSENT'}`);
  // Spécifications
  const specs = publiees.filter((p: any) => p.schema?.source === 'spec' && p.schema.gabarit && p.schema.params && p.texte);
  const dessins = await dessinerSpecs(specs.map((p: any) => ({ id: p.id, gabarit: p.schema.gabarit, params: p.schema.params, source: cm.texteBrut(p.texte), titre_section: mt.rubriques.find((r: any) => r.id === p.id)?.titre })), 'paysage', theme);
  let ok = 0;
  const ko: string[] = [];
  for (const p of specs) { const d = dessins.get(p.id); if (d?.ok && d.svg) ok++; else ko.push(`${p.id} (${(d?.erreurs || ['?']).slice(0, 1).join('')})`); }
  console.log(`spec : ${ok}/${specs.length} dessinés en paysage sur le texte brut publiposté ; refusés : ${ko.join(' ; ') || 'aucun'}`);
  const reps = specs.filter((p: any) => dessins.get(p.id)?.ok).map((p: any, i: number) => ({ cle: `s${i}`, question: 'xx', texte: 'yy', svg: dessins.get(p.id).svg, svgId: `mt_${p.id}` }));
  const out2 = choisir(reps, theme);
  console.log(`spec : ${out2.length}/${reps.length} retenus par choisir, tous dessinés tels quels : ${out2.every((o: any, i: number) => o.svg === reps[i].svg)}`);
  const vb = out2.slice(0, 3).map((o: any) => /viewBox="([^"]+)"/.exec(o.svg)?.[1]);
  console.log('viewBox (paysage attendu) :', vb.join(' | '));
})();
