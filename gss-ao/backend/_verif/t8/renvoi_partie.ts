// Reproduction : renvoi « développée au bloc 4 » d'une rubrique citée AVANT le renvoi, en format court.
import { renvoisVersParties } from '../../src/generation/format_court';
const texte = "- **La nuit, les rondes s'effectuent entre 20h30 et 6h00 du matin** → notre réponse : « Le contrôleur de rondes », développée au bloc 4.";
const blocs = [{ numero: 4, rubriques: ['b4_rondes', 'b4_proc_alarme', 'b4_tenues'] }];
const parties = [{ id: 'c1', title: 'Organisation et moyens humains' }, { id: 'c2', title: 'Continuité de service' }, { id: 'c3', title: 'Moyens matériels' }];
const retenues = { c1: [], c2: ['b4_proc_alarme'], c3: ['b4_rondes', 'b4_tenues'] };
const titres = { b4_rondes: 'Le contrôleur de rondes', b4_proc_alarme: "Notre socle de procédures : l'intervention sur alarme et la télésurveillance", b4_tenues: 'Les tenues' };
console.log(renvoisVersParties(texte, blocs, parties, retenues, titres));
