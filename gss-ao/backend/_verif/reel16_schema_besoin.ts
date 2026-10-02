/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — bloc 1 de la génération réelle ign 16 :
 *  1. puces « **Ce que vous attendez** (« citation ») : → notre réponse : … » : la citation devient le contenu de la puce
 *     (citationsCoherentes), aucune puce « Ce que vous attendez : → … » vide ;
 *  2. schéma de secours sur le contenu (specSecoursPuces : points de vigilance et attentes du texte) accepté par le moteur
 *     de schémas, sans les intitulés génériques « Votre contexte / Le périmètre / Vos attentes ».
 * Usage : npx ts-node --transpile-only _verif/reel16_schema_besoin.ts <fichier json> [<svg de sortie>]
 */
import fs from 'fs';
import { citationsCoherentes, specSecoursPuces } from '../src/generation/reponse_libre_v2';
import { dessinerSpecs } from '../src/generation/schema_service';
(async () => {
  const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
  let ko = 0;
  const brut: string = r.sections.b1_comprehension;
  // Les puces vides de la génération ign 16 sont reconstituées avec leur citation d'origine (relevée dans le journal du DCE).
  const avecCitations = brut
    .replace('- **Ce que vous attendez** : → notre réponse : processus de remplacement', '- **Ce que vous attendez** (« la continuité doit toujours s’opérer entre l’agent en place et la relève ») : → notre réponse : processus de remplacement')
    .replace('- **Ce que vous attendez** : → notre réponse : planification', '- **Ce que vous attendez** (« au moins sept (7) jours avant le début du mois concerné ») : → notre réponse : planification');
  const c = citationsCoherentes(avecCitations).texte;
  if (/Ce que vous attendez\*\*\s*:\s*→/.test(c)) { ko++; console.log('ÉCHEC : puce « Ce que vous attendez » vide'); }
  const spec = specSecoursPuces(c);
  if (!spec) { ko++; console.log('ÉCHEC : aucun schéma de secours sur le contenu'); }
  else {
    console.log(JSON.stringify(spec.params.etapes, null, 1));
    if (spec.params.etapes.some((e: any) => /^(?:Votre contexte|Le périmètre|Vos attentes|Les points de vigilance)/.test(e.titre))) { ko++; console.log('ÉCHEC : intitulé générique'); }
    const d = (await dessinerSpecs([{ id: 'b1_comprehension', gabarit: spec.gabarit, params: spec.params, source: c, titre_section: 'Des postes continus, formés et suivis sur chaque site' }], 'page')).get('b1_comprehension');
    if (!d?.ok) { ko++; console.log(`ÉCHEC moteur : ${(d?.erreurs || []).join(' | ')}`); }
    else if (process.argv[3]) fs.writeFileSync(process.argv[3], d.svg!);
  }
  console.log(ko ? `${ko} échec(s)` : 'Bloc 1 : puces complètes, schéma de secours sur le contenu accepté par le moteur.');
  process.exit(ko ? 1 : 0);
})();
