// Tour 9 (T9CS-1) : indicateurs du mémoire type sur les 19 DCE du corpus, sans analyse ni matrice (règle sans modèle),
// et plan obtenu (rubriques présentes). Sert à vérifier qu'un changement de motif ne fait basculer que l'indicateur visé.
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const fs = require('fs');
const log = console.log; console.log = () => {}; console.warn = () => {};
const mt = require(B + '/backend/src/generation/memoire_type');
const codes = fs.readdirSync(`${B}/_corpus_verif/_dce_textes`).map((f: string) => f.replace(/\.txt$/, ''));
for (const c of codes) {
  const dce = fs.readFileSync(`${B}/_corpus_verif/_dce_textes/${c}.txt`, 'utf-8');
  const prep = mt.preparerMemoireType({ dce, analyse: { clientName: 'Acheteur' } });
  const vrais = Object.entries(prep.indicateurs).filter(([, v]) => v).map(([k]) => k).sort();
  log(`${c.padEnd(14)} ${vrais.join(' ')}`);
  log(`${''.padEnd(14)} plan: ${prep.plan.rubriques.map((r: any) => r.id).filter((id: string) => /cynophile|proc_alarme|telesurv/.test(id)).join(' ')}`);
}
