// Tour 8 : motif de refus de chaque obligation chiffrée (texte de secours du bloc 1).
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const fs = require('fs');
const bm = require(B + '/backend/src/generation/base_memoires');
const rl = require(B + '/backend/src/generation/reponse_libre_v2');
for (const c of process.argv.slice(2)) {
  const dce = fs.readFileSync(`${B}/_corpus_verif/_dce_textes/${c}.txt`, 'utf-8');
  console.log('########', c);
  for (const o of bm.obligationsChiffrees(dce).slice(0, 25).map((x: any) => x.phrase)) console.log(rl.obligationsLisibles([o]).length ? ' OK ' : ' -- ', o.slice(0, 200));
  for (const h of bm.horairesImposes(dce, 15, undefined, { periodes: true })) console.log(rl.horairesLisibles([h]).length ? ' hOK' : ' h--', h.slice(0, 200));
}
