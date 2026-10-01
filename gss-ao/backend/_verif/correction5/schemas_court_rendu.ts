// Correction 5, bug 12 : rendu du format court avec le process (en tête, en grand) et l'organigramme (toile portrait).
// Hors ligne (aucun appel au modèle) : schémas dessinés par le moteur, rendu PDF par rendreFormatCourt.
import fs from 'fs';
import path from 'path';
import { dessinerSpecs } from '../../src/generation/schema_service';
import { specProcessBesoin } from '../../src/generation/reponse_libre_v2';
import { organigrammeSvg } from '../../src/generation/organigramme';
import { rendreFormatCourt } from '../../src/generation/format_court';
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
const para = (n: number) => Array.from({ length: n }, (_, i) => `Paragraphe ${i + 1} du texte de GSS : nos agents assurent la sécurité du site avec rigueur, la main courante est tenue à jour et chaque événement est signalé au responsable de site dans les délais prévus par le cahier des charges.`).join('\n\n');
(async () => {
  const process_ = (await dessinerSpecs([{ id: 'b1', ...specProcessBesoin(etapes, 'flux')!, source, titre_section: 'Du besoin au service' }], 'page')).get('b1')?.svg;
  const org = organigrammeSvg('page');
  const r = await rendreFormatCourt([
    { titre: 'Organisation et moyens humains', texte: para(8), schema: org || undefined, garder: true },
    { titre: 'Compréhension des enjeux du CCTP', texte: `## Votre contexte et votre site\n\n${para(4)}`, schema: process_, garder: true, tete: true },
  ], { client: 'Association Nouvel IMM', title: 'Marché de sûreté' }, 12, SORTIE);
  console.log(r);
})();
