// Vérification 2 : schéma de process du bloc 1 (ign simulé) — erreurs du moteur pour les étapes, puis pour le secours.
import { dessinerSpecs } from '../src/generation/schema_service';
import { specProcessBesoin, specSecoursBesoin } from '../src/generation/reponse_libre_v2';
const etat = require(process.argv[2]);
const texte: string = etat.libre.sections.b1_comprehension.split('\n## Remarques')[0];
const sim = require('fs').readFileSync(__dirname + '/verif2_simulation.ts', 'utf-8');
(async () => {
  const etapes = [
    { titre: 'Votre besoin', texte: 'Deux bâtiments surveillés 7 j/7 et 24 h/24', role: 'rouge' },
    { titre: 'Vos enjeux', texte: "Un campus ouvert en permanence, un PCA partagé avec l'UGE", role: 'rouge' },
    { titre: 'Notre dispositif', texte: 'Remplaçant présent sur site dans les deux heures', role: 'orange' },
    { titre: 'Notre pilotage', texte: 'Un référent unique, une réunion de suivi bimestrielle', role: 'bleu' },
    { titre: 'Votre résultat', texte: 'Des rondes tracées en temps réel', role: 'vert' },
  ];
  for (const [nom, spec] of [['etapes', specProcessBesoin(etapes, 'flux')], ['secours', specSecoursBesoin(texte)]] as const) {
    console.log(nom, JSON.stringify(spec));
    if (!spec) continue;
    const r = (await dessinerSpecs([{ id: 'b1_comprehension', gabarit: spec.gabarit, params: spec.params, source: texte, titre_section: 'Votre besoin' } as any], 'page')).get('b1_comprehension');
    console.log(nom, '→', r?.ok ? 'OK' : r?.erreurs);
  }
  process.exit(0);
})();
