// Tour 8 : horaires imposés (option périodes) et texte de secours sur un texte de DCE donné (fichier).
const fs = require('fs');
const bm = require('../../src/generation/base_memoires');
const rl = require('../../src/generation/reponse_libre_v2');
const dce = fs.readFileSync(process.argv[2], 'utf-8');
const h = bm.horairesImposes(dce, Number(process.argv[3] || 15), undefined, { periodes: true });
h.forEach((x: string) => console.log(' H', x));
console.log(rl.horairesLisibles(h).map((x: string) => ` L ${x}`).join('\n'));
