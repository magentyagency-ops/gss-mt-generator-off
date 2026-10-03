import { perimetreSecours, phraseSites, horairesLisibles } from '../../src/generation/reponse_libre_v2';
console.log(perimetreSecours("- Levée de doute : oui, sur appel de la télésurveillance après alarme incendie ou intrusion, ou incident ; de 19 h 30 à 07 h 20 les jours d’ouverture, à tout horaire les jours de fermeture. Elle comprend vérifications, sécurisation, alerte et compte rendu ; le délai d’intervention doit être précisé par GSS."));
console.log(phraseSites(['Site du CSTB Grenoble — 24 rue Joseph Fourier, 38400 Saint-Martin-d’Hères'], ["Saint Martin d'Hères", 'St Martin d’Hères']));
console.log(phraseSites(['CAEN — 20 rue Alfred Kastler, 14000 Caen'], ['Caen']));
console.log(phraseSites(['Centre Henri Becquerel', 'Bâtiment B'], ['Rouen']));
console.log(horairesLisibles(["SITE Adresse Surface Utile Brute Horaires d’ouverture CAEN 20 rue Alfred 2820 07h00-19h00 Kastler 14000 Caen 1.2 DEBUT D’EXECUTION DES PRESTATIONS Les prestations pour le site de Caen débuteront à compter de la date de prise d’effet du marché."]));
