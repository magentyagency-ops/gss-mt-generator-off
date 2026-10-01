// Correction 2, bug A : pageDe doit renvoyer la page de la rubrique (en-tête), pas l'ouverture de bloc.
import { pageDe } from '../src/generation/assistant_memoire';
const V = '/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/verif2';
const attendus: Record<string, [string, number][]> = {
  becquerel: [["Service minimal en cas d'arrêt de travail", 138], ["Entretien du PC sécurité et du poste d'accueil", 140], ['Le relais du standard téléphonique', 103]],
  caen: [['Le plan de prévention', 121], ['La passation en fin de marché', 123]],
  ign: [['Le plan de prévention', 139], ["La coordination avec le prestataire de l'UGE", 102], ['La reprise des données GuardTek', 104]],
};
let ko = 0;
for (const [c, l] of Object.entries(attendus)) for (const [t, p] of l) {
  const r = pageDe(`${V}/${c}/memoire.pdf`, t);
  if (r !== p) ko++;
  console.log(`${r === p ? 'OK ' : 'KO '} ${c} « ${t} » : ${r} (attendu ${p})`);
}
console.log(ko ? `${ko} écart(s)` : 'tous conformes');
