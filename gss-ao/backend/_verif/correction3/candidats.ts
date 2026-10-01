// Correction 3 : candidats du mémoire type par champ développé du corpus (sans appel au modèle), avec l'intitulé
// principal (hors mémoire type), la compréhension du besoin, les champs de valeur et l'attribution sans doublon.
// Usage : npx ts-node --transpile-only -P tsconfig.json _verif/correction3/candidats.ts <dossier des *.complet.txt>
import fs from 'fs'; import path from 'path';
const B = path.resolve(__dirname, '../..');
const mtm = require(path.join(B, 'src/generation/memoire_type'));
const cm = require(path.join(B, 'src/generation/memoire_type_cadre'));
const D = process.argv[2];
const mt = mtm.chargerMemoireType();
const prep = mtm.preparerMemoireType({ analyse: { clientName: 'Ville de Test' }, dce: '', cover: {}, referents: '', horsNormandie: false }, { memoireType: mt });
const textes: Record<string, string> = {};
for (const p of mtm.publierMemoire(prep)) if (p.texte && p.mode !== 'besoin') textes[p.id] = p.texte;
let doublons = 0;
for (const f of fs.readdirSync(D).filter((x) => x.endsWith('.complet.txt'))) {
  const t = fs.readFileSync(path.join(D, f), 'utf-8');
  const lignes = t.split('\n').filter((l) => /^Champ \[CHAMP_\d+\] \[PARAGRAPHE\]/.test(l) && !/\|\s*Tableau:/.test(l));
  console.log(`\n=== ${f} (${lignes.length} paragraphes)`);
  const champs: any[] = [];
  for (const l of lignes) {
    const id = Number(/CHAMP_(\d+)/.exec(l)![1]);
    const question = (/Question:\s*"([^"]*)"/.exec(l) || [])[1] || ((/Contexte(?: proche)?:\s*"([^"]*)"/.exec(l) || [])[1] || '').split('/').map((s) => s.trim()).filter(Boolean).pop() || '';
    const critere = (/Critère:\s*"([^"]*)"/.exec(l) || [])[1] || '';
    const q = `${question} ${critere}`.trim();
    const valeur = cm.champValeur(question);
    const compr = !valeur && cm.questionComprehension(question);
    const hors = cm.questionHorsMemoireType(question, critere);
    const c = valeur || compr ? [] : cm.candidatsReference(mt, textes, q, { hors });
    champs.push({ id, libelle: cm.intitulePrincipal(question), candidats: c, etiquette: valeur ? '[VALEUR]' : compr ? '[COMPRÉHENSION]' : hors ? '[HORS MT]' : '', q });
  }
  const a = cm.attribuerRubriques(champs.filter((c) => c.candidats.length));
  const vus = new Map<string, number>();
  for (const c of champs) {
    const g = a.candidats.get(c.id) || [];
    for (const x of g) { if (vus.has(x.id)) { doublons++; console.log(`  !! DOUBLON ${x.id} champs ${vus.get(x.id)} et ${c.id}`); } vus.set(x.id, c.id); }
    const r = a.renvois.get(c.id) || [];
    console.log(`CHAMP_${c.id} ${c.etiquette} avant=${c.candidats.map((x: any) => x.id).join(',') || '-'} apres=${g.map((x: any) => x.id).join(',') || '-'}${r.length ? ` renvoi=${r.map((x: any) => x.titre).join('|')}` : ''} | principal: ${c.libelle.slice(0, 90)}`);
  }
}
console.log(`\nDoublons après attribution : ${doublons}`);
