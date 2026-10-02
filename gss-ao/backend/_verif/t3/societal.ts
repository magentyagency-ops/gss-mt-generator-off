// T3N-7 : rubriques candidates (recherche lexicale) pour le champ « Mesures et initiatives sociétales » du cadre havre2.
import { chargerMemoireType, rechercherRubriques } from '../../src/generation/memoire_type';
const mt = chargerMemoireType();
const qs = [
  "Le renvoi vers un rapport général de la responsabilité sociétale de l’entreprise (du groupe) est à proscrire, sauf à cibler spécifiquement les chapitres / paragraphes de celui-ci. Les réponses doivent être rédigée en Français. MESURES ET INITIATIVES SOCIETALES MISES EN PLACE DANS LE CADRE DE LA PRESTATION",
  "MESURES ET INITIATIVES SOCIETALES MISES EN PLACE DANS LE CADRE DE LA PRESTATION Le soumissionnaire décrit les moyens et actions dans le domaine de sa responsabilité sociétale qu’il propose de mettre en œuvre pendant l’exécution du marché. Cela peut concerner les personnes éloignées de l’emploi ou les jeunes en situation de décrochage scolaire, la lutte contre les discriminations, la sélection et l’audit de ses fournisseurs sur leur responsabilité sociétale, etc.",
  "MESURES ET INITIATIVES ENVIRONNEMENTALES MISES EN PLACE DANS LE CADRE DE LA PRESTATION Le soumissionnaire décrit les moyens et actions dans le domaine environnemental qu’il propose de mettre en œuvre pendant l’exécution du marché. Cela peut concerner le mode transport des agents, la dématérialisation des supports, le recyclage des vêtements professionnels en fin de vie, etc.",
];
for (const q of qs) console.log(q.slice(0, 60), JSON.stringify(rechercherRubriques(mt, q, 5)));
import { questionUtileChamp } from '../../src/generation/memoire_type_cadre';
const ctx = `Section: "MESURES ET INITIATIVES SOCIETALES MISES EN PLACE DANS LE CADRE DE LA PRESTATION" | Question: "Le renvoi vers un rapport général de la responsabilité sociétale de l’entreprise (du groupe) est à proscrire, sauf à cibler spécifiquement les chapitres / paragraphes de celui-ci. Les réponses doivent être rédigée en Français." | Contexte: "Cela peut concerner les personnes éloignées de l’emploi ou les jeunes en situation de décrochage scolaire, la lutte contre les discriminations, la sélection et l’audit de ses fournisseurs sur leur responsabilité sociétale, etc. / Le renvoi vers un rapport général de la responsabilité sociétale de l’entreprise (du groupe) est à proscrire, sauf à cibler spécifiquement les chapitres / paragraphes de celui-ci. Les réponses doivent être rédigée en Français."`;
const qu = questionUtileChamp(ctx);
console.log('questionUtileChamp :', qu);
console.log('rubriques :', JSON.stringify(rechercherRubriques(mt, qu, 4)));
