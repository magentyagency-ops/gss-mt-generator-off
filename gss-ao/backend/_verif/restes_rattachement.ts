/**
 * Rattachement des ajouts du CCTP à la bonne rubrique (vérification 9, bug 6) : la rubrique « L'intégration d'un nouveau
 * marché » (sujet étroit : la période de démarrage) ne reçoit plus les obligations quotidiennes qui partagent seulement le
 * mot-clé « prise de poste » (accueil de Coriolis à 7h00, remplaçant sous 2 heures, IGN) ni les exigences de fin de marché
 * (état des lieux, restitution des locaux) ; un tel ajout de l'adaptation est refusé (générations réelles ign 11 à 13).
 * Engagements « Nos engagements sur les exigences du cahier des charges » : facturation et paiement écartés. Aucun appel OpenAI.
 * Usage : npx ts-node --transpile-only _verif/restes_rattachement.ts
 */
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, obligationsPourRubrique, appliquerModifications, adapterRubrique, sujetDeRubrique } from '../src/generation/memoire_type';

let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const dce = (c: string) => fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_dce_textes/${c}.txt`), 'utf-8');
const mt = chargerMemoireType();
const rub = (id: string) => mt.rubriques.find((r) => r.id === id)!;
const nm = rub('b5_nouveau_marche');
const ign = dce('ign');

// 1. Obligations transmises à l'adaptation.
const obNm = obligationsPourRubrique(nm, ign);
verifier('IGN : ni Coriolis ni remplaçant sous 2 heures transmis à « nouveau marché »', !obNm.some((o) => /Coriolis|rempla[çc]ant/i.test(o)), obNm.join(' | '));
verifier('IGN : Coriolis toujours transmis à « accueil et filtrage »', obligationsPourRubrique(rub('b4_accueil_filtrage'), ign).some((o) => /Coriolis/.test(o)));
const obImm = obligationsPourRubrique(nm, dce('imm'));
verifier('IMM : manuel de procédure « 2 mois après le démarrage » toujours transmis à « nouveau marché »', obImm.some((o) => /d[ée]marrage des prestations/.test(o)), obImm.join(' | '));
verifier('IMM : « dégradation » ne déclenche plus le mot-clé DATI (PTI)', !obligationsPourRubrique(rub('b4_pti'), dce('imm')).some((o) => /d[ée]gradation/.test(o)));

// 2. Ajouts de l'adaptation (texte de référence de la rubrique, client IGN).
const texte = String(nm.texte).replace(/\{\{[^}]*\}\}/g, 'l\'IGN');
const essai = (ajout: string) => appliquerModifications(texte, { ajouts: [{ texte: ajout }] }, { dce: ign, reference: texte, sujetAjouts: sujetDeRubrique(nm) });
const coriolis = essai('À Coriolis, l’accueil des premiers utilisateurs du bâtiment est assuré par le SSIAP 2 dédié à CORIOLIS lors de sa prise de poste, à compter de 7h00.');
verifier('ajout « accueil de Coriolis à 7h00 » refusé (hors du sujet)', !coriolis.appliquees.length && /hors du sujet/.test(coriolis.refusees[0]?.raison || ''), coriolis.refusees[0]?.raison);
const edl = essai('À la notification puis à l’échéance, un état des lieux contradictoire des locaux et installations est effectué ; les locaux sont restitués en parfait état.');
verifier('ajout « état des lieux de fin de marché » refusé', !edl.appliquees.length, edl.refusees[0]?.raison);
const repute = appliquerModifications(texte, { ajouts: [{ texte: 'Il est réputé avoir pris connaissance, vérifié et complété, par toute visite nécessaire et obligatoire, les données indispensables à l’exécution de ses prestations.' }] }, { dce: ign, reference: texte });
verifier('ajout « est réputé avoir pris connaissance » (CCTP recopié à la voix de l\'acheteur) refusé même sans sujet étroit', !repute.appliquees.length && /voix de l'acheteur/.test(repute.refusees[0]?.raison || ''), repute.refusees[0]?.raison);
const legit = appliquerModifications(texte, { ajouts: [{ texte: 'Le plan de prévention est établi avant le démarrage des prestations, lors de la réunion sur site.' }] }, { dce: ign, reference: texte, sujetAjouts: sujetDeRubrique(nm) });
verifier('ajout sur la période de démarrage accepté', legit.appliquees.length === 1, legit.refusees[0]?.raison);
// adapterRubrique applique le sujet de la rubrique sans option supplémentaire.
(async () => {
  const res = await adapterRubrique(nm, texte, { dce: ign }, async () => JSON.stringify({ ajouts: [{ texte: 'À Coriolis, l’accueil des premiers utilisateurs du bâtiment est assuré par le SSIAP 2 dédié à CORIOLIS lors de sa prise de poste, à compter de 7h00.' }] }));
  verifier('adapterRubrique : sujet de la rubrique appliqué d\'office', !res.appliquees.length && res.texte === texte, res.refusees[0]?.raison);
  const planif = rub('b4_planification');
  verifier('rubrique sans sujet étroit : aucun filtre (planification)', sujetDeRubrique(planif) === null);

  // 3. Engagements chiffrés : facturation et paiement écartés (modèle simulé).
  const { MemoireGenerator } = require('../src/generation/memoire_generator');
  const P: any = MemoireGenerator.prototype;
  P.callOpenAI = async () => JSON.stringify({ puces: [
    { rubrique: 'b5_nouveau_marche', texte: 'GSS s’engage à ce que la dernière facture puisse être différée jusqu’à la remise en état des locaux.' },
    { rubrique: 'b5_nouveau_marche', texte: 'Les frais de remise en état pourront être imputés à GSS et le paiement différé.' },
    { rubrique: 'b4_planification', texte: 'Les plannings sont transmis au SAIMG au plus tard 7 jours avant le début du mois.' },
  ] });
  const sections: Record<string, string> = { b5_nouveau_marche: 'Texte de la rubrique.', b4_planification: 'Texte de la planification.' };
  await P.engagementsChiffresManquants.call(new MemoireGenerator(), sections, [{ id: 'b5_nouveau_marche', title: 'Nouveau marché' }, { id: 'b4_planification', title: 'Planification' }], 'Le planning est transmis au plus tard 7 jours avant le début du mois. Le paiement de la dernière facture peut être différé jusqu’à la remise en état.');
  verifier('engagements : facturation et paiement écartés', !/factur|paiement|imput/i.test(sections.b5_nouveau_marche), sections.b5_nouveau_marche);
  verifier('engagements : engagement opérationnel gardé', /7 jours avant/.test(sections.b4_planification), sections.b4_planification);
  console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
})();
// 4. Texte final (tous modes) : phrase du CCTP recopiée à la voix de l'acheteur « est réputé … » retirée (génération ign 13).
import { sansRecopieCctp } from '../src/generation/base_memoires';
const fin = sansRecopieCctp('Le dispositif est en place. GSS est réputé avoir pris connaissance, vérifié et complété, par toute visite nécessaire et obligatoire, les données indispensables à l’exécution de ses prestations.', ign);
verifier('texte final : « est réputé avoir pris connaissance » recopié retiré', fin.texte === 'Le dispositif est en place.', fin.texte);
