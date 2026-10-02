import fs from 'fs';
import { variablesDuMarche, chargerMemoireType, publiposter, formeCourteApresPremiere } from '../src/generation/memoire_type';
const mt = chargerMemoireType();
for (const [n, f] of [["Ville de Vitry-sur-Seine, en qualité de coordonnateur des groupements de commandes Ville/Sidoresto et Ville/CCAS", 'vitry'], ["Ministère de la Justice – Service administratif régional de Rouen / BOP Normand (cours d'appel de Rouen et de Caen)", 'ca_normandie']]) {
  const dce = fs.readFileSync(`../_corpus_verif/_dce_textes/${f}.txt`, 'utf-8');
  const v = variablesDuMarche(mt, { cover: { client: n }, analyse: { clientName: n }, dce, registre: [] } as any, {});
  console.log(JSON.stringify(v.CLIENT));
  const t = 'Nous accompagnons {{CLIENT}} depuis le démarrage. Le LMC est présenté à {{CLIENT}}. {{CLIENT}} reçoit le rapport. Pour {{CLIENT}}, GSS dédie une équipe.';
  console.log(publiposter(t, v, { definitions: mt.variables }).texte);
  console.log(publiposter(t, v, { definitions: mt.variables, clientLong: true }).texte);
  const cl: any = v.CLIENT;
  console.log(formeCourteApresPremiere([`Réponse au ${n} pour le lot.`, `présentation du LMC terminé au ${n} et installation.`], cl.valeur, cl.court ? { article: cl.articleCourt, nom: cl.court } : undefined, cl.article));
}
