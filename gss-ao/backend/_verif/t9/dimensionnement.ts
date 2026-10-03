// Tour 9 (T9N-1, T9N-5) : dimensionnement recalculé sans modèle à partir des réponses enregistrées des générations réelles
// (cstb 551, etampes1 594, etampes2 552 et 553, caen 475, citedia2 474), et question posée à GSS.
const fs = require('fs');
const log = console.log; console.log = () => {}; console.warn = () => {};
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const Q = '/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/qualite';
const dim = require(B + '/backend/src/generation/dimensionnement');
const cas: Array<[string, string]> = [['cstb', `${Q}/tour5/consignes/enreg_cstb_551.json`], ['etampes1', `${Q}/tour5/correction/enreg_etampes1_594.json`], ['etampes2', `${Q}/tour5/consignes/enreg_etampes2_552.json`], ['etampes2', `${Q}/tour5/correction/enreg_etampes2_553.json`], ['caen', `${Q}/enreg_caen_475.json`], ['citedia2', `${Q}/enreg_citedia2_474.json`]];
for (const [code, f] of cas) {
  if (!fs.existsSync(f)) continue;
  const dce = fs.readFileSync(`${B}/_corpus_verif/_dce_textes/${code}.txt`, 'utf-8');
  const e = JSON.parse(fs.readFileSync(f, 'utf-8'));
  let rep: any = null;
  for (const l of Object.values(e.chat || {}) as any[]) for (const r of l) { const c = r?.choices?.[0]?.message?.content || ''; if (c.includes('"postes"')) { try { rep = JSON.parse(c); } catch { /* */ } } }
  const d = dim.calculerDimensionnement(rep, dce);
  log(`== ${code} (${f.split('/').pop()})`);
  if (!d) { log('   null'); continue; }
  log(`   profils: ${d.profils.map((x: any) => `${x.profil} ${x.heuresSemaine} h → ${x.titulaires}`).join(' ; ')} | titulaires ${d.titulaires} suppléants ${d.suppleants}`);
  log(`   cas pratique: ${d.casPratique.map((x: any) => `${x.plage}/${x.profil}=${x.enService}`).join(' ; ')}`);
  log(`   question: ${d.profils.length || d.casPratique.length ? dim.questionDimensionnement(d) : '(aucune proposition)'}`);
  if (d.alertes) log(`   alertes: ${d.alertes.join(' | ')}`);
}
