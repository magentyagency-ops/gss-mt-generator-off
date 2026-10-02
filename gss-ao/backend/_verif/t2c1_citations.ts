// Tour 2 (T2C-1, génération réelle de contrôle ca_normandie 241) : attentes écrites en citation du DCE (« « … » — réponse :
// … ») : le schéma de secours du bloc 1 les lit (avant : secours par sous-titres, « Votre contexte / Le périmètre / Vos
// attentes », titres sans contenu).
import { specSecoursPuces, anomaliesSchemaBloc1 } from '../src/generation/reponse_libre_v2';
const texte = `## Votre contexte et votre site
Le marché couvre les lots 1 et 2 des juridictions normandes : le ressort de la cour d'appel de Rouen et celui de la cour d'appel de Caen.

## Vos attentes et nos engagements
- « main courante tenue en temps réel » — réponse : main courante électronique, avec accès en temps réel du RSEM et conservation des données.
- « qualification de l'alarme dans les 5 minutes suivant sa réception » — réponse : traitement selon la procédure d'intervention sur alarme.
- « délai maximum de 20 minutes » pour la levée de doute — réponse : procédure d'intervention sur alarme et télésurveillance, avec intervention tracée.
- « Au moins deux fois par jour pour les rondes extérieures » — réponse : planification et contrôleur de rondes, avec rondes tracées.

## Les points de vigilance
- **Point de vigilance** : le besoin du Palais de justice de Rouen indique à la fois deux SSIAP 1 en journée et « 24h/24 et 7j/7 » → notre réponse : intégration du marché et mise en place de la prestation à partir des postes définis au CCTP.
- **Point de vigilance** : l'astreinte week-end et jours fériés varie selon les juridictions → notre réponse : planification et gestion des commandes supplémentaires selon les consignes du marché.

Les juridictions sont ainsi sécurisées en continu, avec une prestation tracée et contrôlée.`;
const s = specSecoursPuces(texte);
console.log(s ? s.params.etapes.map((e: any) => `${e.titre} / ${e.texte}`).join('\n') : 'null');
const a = s ? anomaliesSchemaBloc1(s) : ['null'];
console.log('anomalies :', a);
process.exit(s && !a.length ? 0 : 1);
