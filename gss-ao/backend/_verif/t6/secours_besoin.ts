// Texte de secours du bloc 1 (rédaction indisponible) d'un dossier du corpus, sans modèle : horaires, obligations, minimum.
import fs from 'fs';
const b = require('../../src/generation/base_memoires');
const r = require('../../src/generation/reponse_libre_v2');
const mt = require('../../src/generation/memoire_type');
const code = process.argv[2];
const dce = fs.readFileSync(`${__dirname}/../../../_corpus_verif/_dce_textes/${code}.txt`, 'utf-8');
console.log('HORAIRES', JSON.stringify(b.horairesImposes(dce), null, 1));
const prep = mt.preparerMemoireType({ dce, analyse: { clientName: code.toUpperCase() } });
const besoin = mt.donneesBesoin(prep, { dce, analyse: { clientName: code.toUpperCase() } });
const t = r.texteSecoursBesoin(besoin, '');
console.log('SECOURS\n' + t);
const matrice = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf-8')).matrice : besoin.obligations.map((x: string) => ({ exigence: x }));
console.log('MINIMUM\n' + r.completerBesoinMinimum(t, matrice, prep.plan, dce).texte);
