const fs = require('fs');
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const mt = require(B + '/backend/src/generation/memoire_type');
const rl = require(B + '/backend/src/generation/reponse_libre_v2');
const cas: Record<string, any> = {
  fontainebleau: [{ name: 'Château de Fontainebleau' }],
  citedia: [{ name: 'Parc Gare' }, { name: 'Parc Médiathèque' }],
  ifits: [{ name: 'Site de Neuilly-sur-Marne' }],
  parc_expo: [{ name: 'Parc des Expositions de Rouen' }], havre1: [{ name: 'Jardins suspendus' }], rouen_univ: [{ name: 'Campus de Mont-Saint-Aignan' }], cstb: [{ name: 'Site du CSTB Grenoble' }], ign: [{ name: 'Bâtiment Coriolis' }],
};
for (const [c, sites] of Object.entries(cas)) {
  const dce = fs.readFileSync(`${B}/_corpus_verif/_dce_textes/${c}.txt`, 'utf-8');
  const ctx = { dce, analyse: { clientName: 'X', sites } };
  const prep = mt.preparerMemoireType(ctx);
  const db = mt.donneesBesoin(prep, ctx);
  console.log('RES', c, 'VILLE=', JSON.stringify(db.villes), 'HN=', prep.indicateurs.HORS_NORMANDIE, '→', rl.phraseSites(db.sites, db.villes));
}
