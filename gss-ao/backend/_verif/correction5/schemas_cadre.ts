// Correction 5, bug 5 : schémas du cadre limités à la rubrique reprise et tuile « Flotte électrique » retirée quand le
// DCE impose une motorisation thermique (hors ligne : moteur de schémas local, aucun appel au modèle).
import fs from 'fs';
import path from 'path';
import { choisir, schemasSelonDce, ReponseCadre } from '../../src/generation/visuels_cadre';
const SORTIE = process.argv[2] || path.join(__dirname, 'sorties');
fs.mkdirSync(SORTIE, { recursive: true });
let ko = 0;
(async () => {
  // 1. Sans rubrique reprise : aucun schéma choisi par recouvrement de mots quand le mémoire type est actif.
  const sansReprise: ReponseCadre[] = [{ cle: 'GSS_CH_1', question: 'Observations techniques sur le report des alarmes', texte: 'Sur les campus de Mont-Saint-Aignan, Elbeuf et du Madrillet, une levée de doute est réalisée par le rondier intervenant, la tenue est vérifiée, la main courante électronique consigne chaque intervention et les locaux techniques sont contrôlés. '.repeat(4) }];
  const a = choisir(sansReprise, undefined, { seulementReprise: true });
  const b = choisir(sansReprise, undefined, {});
  console.log(a.length === 0 ? 'OK ' : 'KO ', `mémoire type actif : ${a.length} schéma ; retour arrière (recherche par mots) : ${b.map((x) => x.id).join(', ') || 'aucun'}`);
  if (a.length) ko++;
  // 2. Flotte électrique contraire au CCTP thermique.
  const dce = "Le véhicule mis à disposition sera à motorisation thermique (si possible hybride non rechargeable) : le campus ne dispose pas de borne de recharge.";
  const rse: ReponseCadre[] = [{ cle: 'GSS_CH_2', question: 'Réduction des émissions de la flotte', texte: 'x'.repeat(700), prefere: 'I-RSE-02' }];
  await schemasSelonDce(rse, dce);
  const ok2 = !!rse[0].svg && !/lectrique/.test(rse[0].svg) && /Covoiturage/.test(rse[0].svg) && !rse[0].prefere;
  if (!ok2) ko++;
  console.log(ok2 ? 'OK ' : 'KO ', `I-RSE-02 redessiné sans « Flotte électrique » (${rse[0].svgId})`);
  if (rse[0].svg) fs.writeFileSync(path.join(SORTIE, 'I-RSE-02-dce.svg'), rse[0].svg);
  const rse2: ReponseCadre[] = [{ cle: 'GSS_CH_3', question: 'Engagement écologique', texte: 'x'.repeat(700), prefere: 'I-RSE-02' }];
  await schemasSelonDce(rse2, 'Aucune contrainte de motorisation.');
  if (rse2[0].prefere !== 'I-RSE-02') ko++;
  console.log(rse2[0].prefere === 'I-RSE-02' ? 'OK ' : 'KO ', 'DCE sans contrainte : schéma de bibliothèque inchangé');
  console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
})();
