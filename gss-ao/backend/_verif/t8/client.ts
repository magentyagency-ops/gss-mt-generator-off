const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend';
const mt = require(B + '/src/generation/memoire_type');
const cas: Array<[string, string, string]> = [
  ['EPCC', "Établissement public de coopération culturelle Opéra de Rouen Normandie, Théâtre des Arts. 76000 Rouen. L'Opéra de Rouen Normandie confie la surveillance du Théâtre des Arts.", "Établissement public de coopération culturelle Opéra de Rouen Normandie"],
  ['EPIC', "Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès. 76000 Rouen.", "Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès"],
  ['Syndicat', "Syndicat intercommunal à vocation multiple de la région d'Yvetot. 76190 Yvetot.", "Syndicat intercommunal à vocation multiple de la région d'Yvetot"],
  ['CHI sigle', 'Centre Hospitalier Intercommunal Elbeuf-Louviers-Val de Reuil (CHIELVR). Le CHIELVR confie la surveillance. Le CHIELVR exige. 76410 Saint-Aubin.', 'Centre Hospitalier Intercommunal Elbeuf-Louviers-Val de Reuil'],
  ['CHI sigle analyse', 'Centre Hospitalier Intercommunal Elbeuf-Louviers-Val de Reuil (CHIELVR). Le CHIELVR confie la surveillance. Le CHIELVR exige. 76410 Saint-Aubin.', 'Centre Hospitalier Intercommunal Elbeuf-Louviers-Val de Reuil (CHIELVR)'],
];
for (const [k, dce, client] of cas) {
  const prep = mt.preparerMemoireType({ dce, analyse: { clientName: client } });
  const rub = mt.publierMemoire(prep);
  const t = rub.map((r: any) => r.texte || '').join('\n');
  const occ = (t.match(/(?:l['’]|le |la |du |de la |de l['’]|au |à la |à l['’])?(?:Établissement public|Opéra|Syndicat|Centre Hospitalier|CHIELVR|EPCC|EPIC)[^,.;:\n]{0,60}/g) || []);
  const c: Record<string, number> = {}; for (const o of occ) c[o] = (c[o] || 0) + 1;
  console.log('RES', k, JSON.stringify(prep.variables.CLIENT), '\n   ', JSON.stringify(c).slice(0, 700));
}
