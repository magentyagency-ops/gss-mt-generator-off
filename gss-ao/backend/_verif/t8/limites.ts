const fs = require('fs');
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend';
const { preparerMemoireType, publierMemoire, questionsDuPubliposte, donneesBesoin } = require(B + '/src/generation/memoire_type');
const { texteSecoursBesoin } = require(B + '/src/generation/reponse_libre_v2');
const OUT = process.argv[2];
const cas: Record<string, any> = {
  caps_long: { dce: "CENTRE HOSPITALIER INTERCOMMUNAL ELBEUF-LOUVIERS-VAL DE REUIL (CHI ELVR). Marché de gardiennage et de sécurité incendie (SSIAP 1) du site de Saint-Aubin-lès-Elbeuf (76410). Rondes, PTI.", analyse: { clientName: 'CENTRE HOSPITALIER INTERCOMMUNAL ELBEUF-LOUVIERS-VAL DE REUIL', projectTitle: 'GARDIENNAGE ET SECURITE INCENDIE', lots: [{ num: '1', perimetre: 'Gardiennage' }, { num: '2', perimetre: 'SSIAP' }], duration: '4 ans', sites: [{ name: 'Site de Saint-Aubin-lès-Elbeuf' }] } },
  apostrophe: { dce: "L'Office Public de l'Habitat de la Seine-Maritime (Habitat 76), 76000 Rouen. Accord-cadre multi-attributaires à bons de commande, lot 3 : surveillance des résidences. Rondes de nuit.", analyse: { clientName: "l'Office Public de l'Habitat de la Seine-Maritime", projectTitle: 'Surveillance des résidences', lots: [{ num: '3', perimetre: 'surveillance des résidences' }], duration: '1 an reconductible 3 fois' } },
  hors_norm_mixte: { dce: "Région Hauts-de-France. Sites : Lycée de Beauvais (60000) et Lycée du Tréport (76470). Gardiennage, astreinte, remplacement sous 2 heures.", analyse: { clientName: 'la Région Hauts-de-France', sites: [{ name: 'Lycée de Beauvais' }, { name: 'Lycée du Tréport' }] } },
  vide: { dce: '', analyse: {} },
  sans_analyse: { dce: 'Marché de gardiennage. Rouen (76000).' },
  societe: { dce: 'SAS LOGISTIQUE DU NORD, entrepôt de Lille (59000). Contrat privé de surveillance.', analyse: { clientName: 'SAS LOGISTIQUE DU NORD', marketType: 'privé' } },
  sigle: { dce: "Le Syndicat Mixte pour l'Élimination des Déchets (SMEDAR), Grand-Quevilly (76120). Le SMEDAR confie la surveillance du site VESTA.", analyse: { clientName: "Syndicat Mixte pour l'Élimination des Déchets (SMEDAR)", sites: [{ name: 'Site VESTA' }] } },
};
const res: any = {};
for (const [k, ctx] of Object.entries(cas)) {
  try {
    const t0 = Date.now();
    const prep = preparerMemoireType(ctx as any);
    const rub = publierMemoire(prep);
    const texte = rub.map((r: any) => `## ${r.titre}\n${r.texte || ''}`).join('\n\n');
    const db = donneesBesoin(prep, ctx);
    const secours = texteSecoursBesoin(db);
    fs.writeFileSync(`${OUT}/lim_${k}.md`, secours + '\n\n' + texte);
    const anomalies: string[] = [];
    const rx: Array<[string, RegExp]> = [['accolades', /\{\{|\}\}/], ['de le', /\b[dD]e le\b(?! (?:faire|voir))/], ['à le', /\bà le\b/], ['de les', /\bde les\b/], ['à les', /\bà les\b/], ['double espace', /\S  +\S/], ['espace avant point', /\s\.(?!\.)/], ['article doublé', /\b(le|la|les|l') (le|la|les|l')\b/i], ['undefined', /undefined|null|NaN/], ['MAJ', /[A-ZÉ]{6,} [A-ZÉ]{6,} [A-ZÉ]{6,}/]];
    for (const [n, r] of rx) { const m = texte.split('\n').filter((l) => r.test(l)); if (m.length) anomalies.push(`${n} (${m.length}) : ${m[0].slice(0, 200)}`); }
    res[k] = { ms: Date.now() - t0, hn: prep.indicateurs?.HORS_NORMANDIE, client: prep.variables?.CLIENT, amorce: db.amorce, questions: questionsDuPubliposte(rub), anomalies };
  } catch (e: any) { res[k] = { ERREUR: e.stack?.split('\n').slice(0, 4).join(' | ') }; }
}
fs.writeFileSync(`${OUT}/limites8.json`, JSON.stringify(res, null, 1));
for (const [k, v] of Object.entries(res) as any) console.log('==', k, JSON.stringify(v, null, 1).slice(0, 3000));
