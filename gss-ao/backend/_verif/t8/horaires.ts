// Tour 8 : horaires imposés et obligations chiffrées (texte de secours du bloc 1), sans modèle.
// Usage (depuis backend/) : [BRUT=1] npx ts-node --transpile-only -P tsconfig.json _verif/t8/horaires.ts caen ign …
const fs = require('fs');
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const bm = require(B + '/backend/src/generation/base_memoires');
const rl = require(B + '/backend/src/generation/reponse_libre_v2');
for (const c of process.argv.slice(2)) {
  const dce = fs.readFileSync(`${B}/_corpus_verif/_dce_textes/${c}.txt`, 'utf-8');
  console.log(`######## ${c}`);
  if (process.env.BRUT) {
    bm.horairesImposes(dce, 20, undefined, { periodes: true }).forEach((h: string) => console.log(' H', h));
    bm.obligationsChiffrees(dce).slice(0, 25).forEach((o: any) => console.log(' O', o.phrase));
  }
  const t = rl.texteSecoursBesoin({ amorce: 'X lance le marché.', client: 'X', objet: '', sites: [], villes: [], horaires: bm.horairesImposes(dce, 20, undefined, { periodes: true }), obligations: bm.obligationsChiffrees(dce).slice(0, 25).map((o: any) => o.phrase), prestations: [] } as any);
  console.log(t.split(/\n\n(?=## (?:Le périmètre|Vos attentes))/).slice(1).join('\n\n'));
}
