// Tour 9 : communes par code postal, sites, lieu du marché, communes du bloc 1 (VILLE) et motif hors Normandie, sur les
// 19 DCE du corpus et sur des cas synthétiques (CS/BP, nom de voie, fuseau horaire, adresse de l'acheteur). Sans modèle.
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const fs = require('fs');
const log = console.log; console.log = () => {}; console.warn = () => {};
const bm = require(B + '/backend/src/generation/base_memoires');
const mt = require(B + '/backend/src/generation/memoire_type');
const ad = require(B + '/backend/src/generation/adaptations_cctp');
const GMT = "Les dates et heures limites s'entendent à l'heure de Paris. A ce titre, le fuseau horaire de référence est celui de (GMT+01:00) Paris, Bruxelles, Copenhague, Madrid.";
const synth: Array<[string, string]> = [
  ['CS Hôtel de Ville', "CCTP\nLieu d'exécution des prestations : Hôtel de Ville, 2 place du Général de Gaulle CS 31402 76037 Rouen\nLe titulaire assure la surveillance du site."],
  ['CS Jeanne d Arc', "CCTP\nAdresse du site : Centre culturel, 12 rue Jeanne d'Arc CS 40021 76000 Rouen\nSurveillance des locaux."],
  ['bd de la Marne', "CCTP\nLe site est situé 42 boulevard de la Marne,\n76000 Rouen.\nSurveillance des locaux."],
  ['Rouen x1 + GMT', `Marché de gardiennage du musée des Beaux-Arts de Rouen. ${GMT}`],
  ['Rouen x2 + GMT', `Marché de gardiennage. Le site est à Rouen, quartier de la gare de Rouen. ${GMT}`],
  ['Évreux + heure de Paris', "Surveillance de la médiathèque d'Évreux. Les offres sont remises avant 12 h, heure de Paris."],
  ['acheteur Paris, site Rouen', "Ministère de l'Intérieur, 75008 Paris. Lieu d'exécution : Hôtel de police, 9 rue Brisout de Barneville, 76100 Rouen."],
  ['Fontainebleau avant code', "Adresse : Château de Fontainebleau 77300 France"],
  ['Dieppe avant code', "Site : centre hospitalier à DIEPPE 76200\nClassification établissement"],
];
const codes = fs.readdirSync(`${B}/_corpus_verif/_dce_textes`).map((f: string) => f.replace(/\.txt$/, ''));
const cas: Array<[string, string]> = [...codes.map((c: string) => [c, fs.readFileSync(`${B}/_corpus_verif/_dce_textes/${c}.txt`, 'utf-8')] as [string, string]), ...synth];
for (const [k, dce] of cas) {
  const analyse = { clientName: 'Acheteur', sites: [{ name: 'Site' }] };
  const l = bm.lieuDuMarche({}, dce);
  const cp = bm.communesParCodePostal(dce.slice(0, 30000), dce).map((c: any) => `${c.code} ${c.commune}`);
  const prep = mt.preparerMemoireType({ dce, analyse });
  const db = mt.donneesBesoin(prep, { dce, analyse });
  log(`${k.padEnd(26)} statut=${l.statut} N=${JSON.stringify(l.normands)} H=${JSON.stringify(l.horsNormandie)} src=${l.source}`);
  log(`${''.padEnd(26)} VILLE=${JSON.stringify(db.villes)} HN=${prep.indicateurs.HORS_NORMANDIE} cp=${JSON.stringify([...new Set(cp)])}`);
  log(`${''.padEnd(26)} exigence=${l.statut !== 'normandie' ? String(ad.exigenceHorsNormandie(dce, {})).slice(0, 120) : ''}`);
}
