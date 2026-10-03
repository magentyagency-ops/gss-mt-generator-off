// T10-COH-2 : cadres de réponse sans zone de réponse (titres numérotés seuls, consignes au présent, rubriques notées).
// Lance _verif/t10c/coh_rejeu10.ts (FAUX=champ : chaque champ reçoit une réponse simulée) sur chaque dossier de
// _verif/t10c/cadres_synthetiques et vérifie : nombre de champs, rubriques toutes remplies, document refusé sans aucune zone.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const D = path.join(__dirname, 'cadres_synthetiques');
const SORTIE = process.argv[2] || '/tmp/t10c_cadres';
const attendus: Record<string, { champs: number; reponses: number; refuse?: boolean }> = {
  cvide: { champs: 4, reponses: 3 }, cvide3: { champs: 4, reponses: 3 }, cvide4: { champs: 4, reponses: 3 }, cvide5: { champs: 3, reponses: 2 }, cvide6: { champs: 3, reponses: 2 },
  cvide7: { champs: 0, reponses: 0, refuse: true },
};
let ko = 0;
for (const [c, a] of Object.entries(attendus)) {
  const out = path.join(SORTIE, c);
  const r = spawnSync('npx', ['ts-node', '--transpile-only', '-P', 'tsconfig.json', path.join(__dirname, 'coh_rejeu10.ts'), c, out], { cwd: path.join(__dirname, '../..'), env: { ...process.env, DOSSIER_SOURCE: path.join(D, c), FAUX: 'champ' }, encoding: 'utf-8', timeout: 600000 });
  const champs = Number((/Detected (\d+) fillable/.exec(r.stdout + r.stderr) || [])[1] || 0);
  const res = JSON.parse(fs.readFileSync(path.join(out, 'resultat.json'), 'utf-8'));
  const reponses = (String(res.texte_docx || '').match(/Réponse rédigée\./g) || []).length;
  const ok = a.refuse ? /Aucun document n'est remis/.test(String(res.erreur?.message || '')) : champs === a.champs && reponses === a.reponses && !res.erreur;
  if (!ok) ko++;
  console.log(`${ok ? 'OK ' : 'KO '} ${c} : ${champs} champ(s), ${reponses} rubrique(s) remplie(s)${res.erreur ? `, erreur ${res.erreur.message}` : ''}`);
}
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
