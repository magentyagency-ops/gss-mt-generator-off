import { specProcessBesoin, defautsEtapesBesoin, anomaliesSchemaBloc1 } from '../../src/generation/reponse_libre_v2';
const e = [{"titre":"Rondes de surveillance","texte":"Le CSTB demande des rondes à pied sur le site CSTB Grenoble.","role":"rouge"},{"titre":"Horaires variables","texte":"Les horaires des rondes de surveillance devront être régulièrement modifiés.","role":"rouge"},{"titre":"Séquences contractuelles","texte":"Nous organisons des horaires variables tout en respectant les séquences contractuelles.","role":"orange"},{"titre":"Main courante","texte":"La main courante enregistre les faits marquants des rondes et interventions.","role":"bleu"},{"titre":"Votre résultat","texte":"Le CSTB dispose de rondes exécutées, d’anomalies signalées et d’interventions tracées.","role":"vert"}];
console.log(defautsEtapesBesoin(e as any));
const s = specProcessBesoin(e as any, 'flux');
console.log(JSON.stringify(s?.params.etapes.map((x: any) => x.texte)));
console.log(anomaliesSchemaBloc1(s));
