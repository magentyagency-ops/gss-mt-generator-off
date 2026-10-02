/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — défauts relevés dans les générations réelles rouen_univ 15, imm 15 et ign 15 :
 *  1. sous-traitance d'une prestation (cadre) : réponse connue de GSS (« Non »), jamais « [À COMPLÉTER] » ;
 *  2. intitulé de question cité dans un renvoi : jamais coupé au milieu d'un mot ;
 *  3. exigence « en écart » mais traitée dans le texte final : pas de question à GSS ;
 *  4. attente du bloc 1 complétée depuis le DCE : initiale en minuscule après « : » (sigle gardé).
 */
import { reponseSousTraitance, libelleQuestion } from '../src/generation/memoire_type_cadre';
import { exigenceTraitee, completerBesoinMinimum } from '../src/generation/reponse_libre_v2';
import { valeurRegistre } from '../src/generation/base_memoires';
let ko = 0, n = 0;
const verifier = (libelle: string, obtenu: unknown, attendu: unknown) => {
  n++;
  if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) { ko++; console.log(`ÉCHEC ${libelle}\n  obtenu  : ${JSON.stringify(obtenu)}\n  attendu : ${JSON.stringify(attendu)}`); }
};
const recours = valeurRegistre('recours_sous_traitance');
const ctx76 = 'Question: "Département 76 :" | Contexte proche: "La prestation d’intervention (lever de doute) est-elle sous-traitée ? Si oui à quelle(s) entreprise(s) [pour information] : / Localisation de la station de télésurveillance :"';
verifier('levée de doute sous-traitée ?', reponseSousTraitance(ctx76, recours), 'Non : la levée de doute est assurée par les équipes de GSS, sans sous-traitance.');
verifier('sous-traitance générale', reponseSousTraitance('Question: "Prestataires habituels de sous-traitance (pour information) :"', recours), "Non : GSS n'a pas recours à la sous-traitance.");
verifier('autre champ', reponseSousTraitance('Question: "Localisation de la station de télésurveillance :"', recours), null);
verifier('GSS sans réponse', reponseSousTraitance(ctx76, ''), null);
const q = 'Des équipements de protection sont-ils fournis aux agents exposés à des risques d’agression (gilets par coups, lame, balles…) ?';
verifier('intitulé court entier', libelleQuestion(q), q);
const long = `${q} ${q}`;
verifier('intitulé long coupé entre deux mots', /\s\S*…$/.test(libelleQuestion(long)) && !/\bbal…/.test(libelleQuestion(long)) && libelleQuestion(long).length <= 161, true);
const texte = '## Nos engagements sur les exigences du cahier des charges\n\n- GSS prendra en compte le périmètre du marché : bâtiment principal composé des bâtiments D, T, C et H, bâtiment P relié par galerie souterraine, bâtiment modulaire, Maison des Parents, locaux et installations annexes, dont fluides médicaux, oxygène et locaux à risques.';
verifier('exigence traitée', exigenceTraitee('Le périmètre comprend le bâtiment principal (bâtiments D, T, C et H), le bâtiment P relié par une galerie souterraine, le bâtiment modulaire, la Maison des Parents et les locaux annexes (fluides médicaux, oxygène, locaux à risques).', texte), true);
verifier('exigence non traitée', exigenceTraitee('Le titulaire organise la réversibilité au plus tard 30 jours avant la fin du marché, avec remise des documents opérationnels.', texte), false);
const b1 = '## Votre contexte et votre site\nLe marché.\n\n## Vos attentes et nos engagements\n- **Ce que vous attendez** : a → notre réponse : x.\n\n## Les points de vigilance identifiés et nos réponses\n- **Point de vigilance** : b → notre réponse : y.';
const m = completerBesoinMinimum(b1, [
  { exigence: 'Le taux moyen mensuel d’indisponibilité du matériel ne doit pas dépasser 3 jours.' },
  { exigence: 'SSIAP 2 présent au PCS de 7h00 à 19h00 tous les jours.' },
], undefined, '', { attentes: 3, vigilance: 1 });
verifier('initiale en minuscule', /\*\*Ce que vous attendez\*\* : le taux moyen mensuel/.test(m.texte), true);
verifier('sigle gardé', /: SSIAP 2 présent au PCS/.test(m.texte), true);
console.log(ko ? `${ko} échec(s) sur ${n}` : `${n}/${n} contrôles conformes`);
process.exit(ko ? 1 : 0);
