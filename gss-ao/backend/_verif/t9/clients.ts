// Tour 9 (T9-COH-1, T9-COH-2) : formes longue et courte du nom de l'acheteur (CLIENT) et premières phrases publipostées,
// sur les cas des vérificateurs (société, capitales, GIP, CCI) et des tours précédents. Sans modèle.
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend';
const log = console.log; console.log = () => {}; console.warn = () => {};
const mt = require(B + '/src/generation/memoire_type');
const cas: Array<[string, string, string]> = [
  ['SPL', 'Société publique locale Citédia Métropole', 'Société publique locale Citédia Métropole. 76000 Rouen. Marché de surveillance.'],
  ['SPL caps', 'Société Publique Locale CITEDIA METROPOLE', 'Société Publique Locale CITEDIA METROPOLE. 76000 Rouen. Marché de surveillance.'],
  ['SEM', "Société d'économie mixte Alençon Normandie Équipements", "Société d'économie mixte Alençon Normandie Équipements. 61000 Alençon. Marché de surveillance."],
  ['SA', 'Société anonyme Logéal Immobilière', 'Société anonyme Logéal Immobilière. 76000 Rouen.'],
  ['SPL sigle', 'SPL Citédia Métropole', 'SPL Citédia Métropole. 76000 Rouen.'],
  ['SPL points', 'S.P.L. CITEDIA METROPOLE', 'S.P.L. CITEDIA METROPOLE. 35000 Rennes.'],
  ['SAS', 'Société par actions simplifiée Rouen Expo Événements', 'Société par actions simplifiée Rouen Expo Événements. 76000 Rouen.'],
  ['SPL long', 'Société publique locale Rouen Normandie Aménagement Développement Économique', 'Société publique locale Rouen Normandie Aménagement Développement Économique. 76000 Rouen.'],
  ['EPCC caps', 'ÉTABLISSEMENT PUBLIC DE COOPÉRATION CULTURELLE OPÉRA DE ROUEN NORMANDIE', "ÉTABLISSEMENT PUBLIC DE COOPÉRATION CULTURELLE OPÉRA DE ROUEN NORMANDIE. 76000 Rouen. L'Opéra de Rouen Normandie confie la surveillance."],
  ['EPCC', 'Établissement public de coopération culturelle Opéra de Rouen Normandie', "Établissement public de coopération culturelle Opéra de Rouen Normandie, Théâtre des Arts. 76000 Rouen. L'Opéra de Rouen Normandie confie la surveillance du Théâtre des Arts."],
  ['EPIC', 'Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès', 'Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès. 76000 Rouen.'],
  ['EPIC caps', 'ETABLISSEMENT PUBLIC INDUSTRIEL ET COMMERCIAL ROUEN NORMANDIE TOURISME & CONGRES', 'ETABLISSEMENT PUBLIC INDUSTRIEL ET COMMERCIAL ROUEN NORMANDIE TOURISME & CONGRES. 76000 Rouen.'],
  ['EPSCP', 'Établissement public à caractère scientifique, culturel et professionnel Université de Rouen Normandie', "Établissement public à caractère scientifique, culturel et professionnel Université de Rouen Normandie. 76130 Mont-Saint-Aignan. L'Université de Rouen Normandie confie."],
  ['GIP 3', "Groupement d'Intérêt Public Formation Continue et Insertion Professionnelle de l'Académie de Rouen", "Groupement d'Intérêt Public Formation Continue et Insertion Professionnelle de l'Académie de Rouen (GIP FCIP). 76000 Rouen. Le GIP FCIP confie la surveillance. Le GIP FCIP exige. Le GIP FCIP."],
  ['GIP 1', "Groupement d'Intérêt Public Formation Continue et Insertion Professionnelle de l'Académie de Rouen", "Groupement d'Intérêt Public Formation Continue et Insertion Professionnelle de l'Académie de Rouen (GIP FCIP). 76000 Rouen. Le GIP FCIP confie."],
  ['CCI', "Chambre de commerce et d'industrie territoriale Rouen Métropole et Seine-Maritime", "Chambre de commerce et d'industrie territoriale Rouen Métropole et Seine-Maritime (CCI Rouen Métropole). 76000 Rouen. La CCI Rouen Métropole confie la surveillance. La CCI Rouen Métropole exige. La CCI Rouen Métropole demande."],
  ['CCI sans sigle', "Chambre de commerce et d'industrie territoriale Rouen Métropole et Seine-Maritime", "Chambre de commerce et d'industrie territoriale Rouen Métropole et Seine-Maritime. 76000 Rouen."],
  ['Office', "Office public de l'habitat de la Métropole Rouen Normandie Rouen Habitat", "Office public de l'habitat de la Métropole Rouen Normandie Rouen Habitat. 76000 Rouen."],
  ['Syndicat', "Syndicat intercommunal à vocation multiple de la région d'Yvetot", "Syndicat intercommunal à vocation multiple de la région d'Yvetot. 76190 Yvetot."],
  ['Syndicat long', 'Syndicat mixte de gestion des déchets ménagers et assimilés de la région elbeuvienne et du plateau du Neubourg', 'Syndicat mixte de gestion des déchets. 76500 Elbeuf.'],
  ['CHI sigle', 'Centre Hospitalier Intercommunal Elbeuf-Louviers-Val de Reuil', 'Centre Hospitalier Intercommunal Elbeuf-Louviers-Val de Reuil (CHIELVR). Le CHIELVR confie la surveillance. Le CHIELVR exige. 76410 Saint-Aubin.'],
  ['EP tutelle', 'Établissement public de coopération culturelle et environnementale du Grand Paris Sud - Direction des moyens généraux et de la logistique', 'Pouvoir adjudicateur : Établissement public de coopération culturelle et environnementale du Grand Paris Sud. 76000 Rouen.'],
  ['SAR', "Ministère de la Justice – Service administratif régional de Rouen (SAR de Rouen), BOP Normand, pour les cours d'appel de Rouen et de Caen", 'Le SAR de Rouen assure. Le SAR de Rouen. Le SAR de Rouen. 76000 Rouen.'],
  ['CCAS', "Centre communal d'action sociale de la ville de Saint-Étienne-du-Rouvray", "Centre communal d'action sociale de la ville de Saint-Étienne-du-Rouvray. 76800 Saint-Étienne-du-Rouvray."],
  ['Asso', 'Association loi 1901 Les Amis du Musée des Beaux-Arts de Rouen', 'Association loi 1901 Les Amis du Musée des Beaux-Arts de Rouen. 76000 Rouen.'],
  ['Mairie', 'COMMUNE DE SAINT-ETIENNE-DU-ROUVRAY', 'COMMUNE DE SAINT-ETIENNE-DU-ROUVRAY DIRECTION DES ACHATS ET DE LA COMMANDE PUBLIQUE. 76800 Saint-Etienne-du-Rouvray.'],
];
for (const [k, client, dce] of cas) {
  const prep = mt.preparerMemoireType({ dce, analyse: { clientName: client } });
  const t = mt.publierMemoire(prep).map((r: any) => r.texte || '').join('\n');
  const v = prep.variables.CLIENT;
  const pour = (/Pour (?:le marché d[eu] |le marché de l['’])?[^,]{0,90}, nous mobilisons/.exec(t) || [''])[0];
  const j3 = (/J-3 : envoi des plannings [^;\n]{0,90}/.exec(t) || [''])[0];
  log(`${k.padEnd(15)} long=${JSON.stringify(v.valeur)} art=${JSON.stringify(v.article)} court=${JSON.stringify(v.court || '')} artC=${JSON.stringify(v.articleCourt ?? '')} genre=${v.genre || ''}/${v.genreCourt ?? ''}`);
  log(`${''.padEnd(15)} ${pour} | ${j3}`);
}
