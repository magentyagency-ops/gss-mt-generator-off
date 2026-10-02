// Tour 2 (T2C-1) : bloc 1 de ca_normandie 221 (cadre imposé, partie 1), points de vigilance « X → notre réponse : Y » sans
// partie « Vos attentes » : le schéma de secours ne doit jamais avoir d'étape vide, tronquée ou redite.
import { specSecoursPuces, specSecoursBesoin, anomaliesSchemaBloc1, completerResultatBesoin, defautsEtapesBesoin, resultatBesoin } from '../src/generation/reponse_libre_v2';
const texte = `## Votre contexte et votre site
Le SAR de Rouen lance le marché « Prestation de sécurité incendie et de gardiennage pour les services judiciaires de la cour d'appel de Rouen et de Caen – BOP Normand » (lots 1 et 2).

## Les points de vigilance
- **Point de vigilance** : le CCTP mentionne des en-têtes 2026-2030, tandis que les annexes indiquent 2027-2030 → notre réponse : préparer l'intégration du marché et la mise en place des prestations selon les échéances contractuelles communiquées.
- **Point de vigilance** : les horaires du SSIAP 1 au Palais de justice de Rouen combinent « Lundi au vendredi : 7h15 à 18h » et « 24h/24 et 7j/7 » → notre réponse : planification des vacations et adaptation du dispositif aux horaires arrêtés.
- **Point de vigilance** : périmètre multisite, horaires fractionnés et prestations sur bon de commande → notre réponse : planification, remplacement des absences et gestion des commandes supplémentaires.
- **Point de vigilance** : audiences, déferrements et situations sensibles dans les juridictions → notre réponse : consignes de site et procédures de gestion d'un individu suspect ou d'un élément perturbateur.

Les horaires fractionnés et les audiences exceptionnelles appellent une continuité multisite. La main courante et les contrôles tracent rondes, incidents et interventions. Les interventions de levée de doute respectent le délai maximal de 20 minutes prévu au CCTP.`;
let ko = 0;
for (const [nom, f] of [['puces', specSecoursPuces], ['sous-titres', specSecoursBesoin]] as const) {
  const s = f(texte);
  const a = s ? anomaliesSchemaBloc1(s) : [];
  if (a.length) ko++;
  console.log(`${nom} : ${s ? s.params.etapes.map((e: any) => `${e.titre} / ${e.texte || '∅'}`).join(' → ') : 'null'}${a.length ? `\n  KO ${a.join(' | ')}` : ''}`);
}
console.log('résultat :', resultatBesoin(texte));
// Étapes du modèle dont seule la dernière dit un moyen : gardées et complétées de « Votre résultat ».
const etapes = [
  { titre: 'Continuité multisite', texte: 'Horaires fractionnés et audiences exceptionnelles sur plusieurs juridictions' },
  { titre: 'Horaires fractionnés', texte: 'Planification des vacations et adaptation du dispositif aux horaires arrêtés' },
  { titre: 'Levées de doute', texte: 'Délai maximal de 20 minutes prévu au CCTP' },
  { titre: 'Consignes de site', texte: 'Procédures de gestion d\'un individu suspect', role: 'vert' },
];
const d = defautsEtapesBesoin(etapes, { texte });
const c = completerResultatBesoin(etapes, texte, d);
const { specProcessBesoin: spb } = require("../src/generation/reponse_libre_v2");
console.log('défauts du modèle :', d, '\ncomplété :', c && c.map((e) => `${e.titre} / ${e.texte}`).join(' → '), c ? anomaliesSchemaBloc1(spb(c, "flux")) : "");
if (!c || anomaliesSchemaBloc1(spb(c, "flux")).length) ko++;
process.exit(ko ? 1 : 0);
