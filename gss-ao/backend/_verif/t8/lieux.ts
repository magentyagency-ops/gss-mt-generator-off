// Tour 8 : sites par code postal, lieu du marché et motif D8 hors Normandie, sur tout le corpus (sans modèle).
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const fs = require('fs');
const bm = require(B + '/backend/src/generation/base_memoires');
const ad = require(B + '/backend/src/generation/adaptations_cctp');
const codes = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(`${B}/_corpus_verif/_dce_textes`).map((f: string) => f.replace(/\.txt$/, ''));
for (const code of codes) {
  const dce = fs.readFileSync(`${B}/_corpus_verif/_dce_textes/${code}.txt`, 'utf-8');
  const l = bm.lieuDuMarche({}, dce);
  console.log(code.padEnd(14), JSON.stringify(bm.sitesDuMarche({}, dce)), l.statut, '|', l.statut !== 'normandie' ? ad.exigenceHorsNormandie(dce, {}).slice(0, 110) : '');
}
