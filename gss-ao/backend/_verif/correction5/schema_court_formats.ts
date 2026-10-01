// Correction 5, bug 12 : schéma de process de la compréhension en format court, toile paysage et page (hors ligne).
import fs from 'fs';
import path from 'path';
import { dessinerSpecs } from '../../src/generation/schema_service';
import { specProcessBesoin } from '../../src/generation/reponse_libre_v2';
const SORTIE = process.argv[2] || path.join(__dirname, 'sorties');
fs.mkdirSync(SORTIE, { recursive: true });
const etapes = [
  { titre: 'Besoin', texte: "Votre besoin porte sur l'Institut Médico-chirurgical Montsouris (IMM)." },
  { titre: 'Enjeux', texte: 'Continuité des soins, aucun poste ne doit être laissé vacant.' },
  { titre: 'Dispositif', texte: 'Trois personnes qualifiées SSIAP au poste de sécurité.' },
  { titre: 'Pilotage', texte: 'Main courante exclusivement sous format numérique, rapport mensuel d’activité.' },
  { titre: 'Résultat', texte: 'Votre résultat attendu est la continuité de service.' },
];
const source = etapes.map((e) => `${e.titre} ${e.texte}`).join(' ');
(async () => {
  for (const format of ['paysage', 'page'] as const) {
    const r = (await dessinerSpecs([{ id: 'b1', ...specProcessBesoin(etapes, 'flux')!, source, titre_section: 'Du besoin au service' }], format)).get('b1');
    if (!r?.svg) { console.log(format, 'KO', r?.erreurs); continue; }
    fs.writeFileSync(path.join(SORTIE, `process_${format}.svg`), r.svg);
    console.log(format, (/viewBox="([^"]+)"/.exec(r.svg) || [])[1]);
  }
})();
