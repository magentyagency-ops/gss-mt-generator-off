// Tour 9 (T9CS-1) : délais imposés lus dans le DCE (delaiDuDce) sur les 19 DCE du corpus, pour chaque sujet.
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const fs = require('fs');
const log = console.log; console.log = () => {}; console.warn = () => {};
const mt = require(B + '/backend/src/generation/memoire_type');
for (const f of fs.readdirSync(`${B}/_corpus_verif/_dce_textes`)) {
  const dce = fs.readFileSync(`${B}/_corpus_verif/_dce_textes/${f}`, 'utf-8');
  log(f.padEnd(18), ['remplacement', 'alarme', 'pti', 'commande', 'ssi'].map((s) => `${s}=${mt.delaiDuDce(dce, s) || '-'}`).join(' '));
}
