// Sites du marché et hors Normandie d'après le DCE d'un dossier du corpus (et l'analyse capturée, si fournie).
import fs from 'fs';
const b = require('../../src/generation/base_memoires');
const [code, analyseF] = process.argv.slice(2);
const dce = fs.readFileSync(`${__dirname}/../../../_corpus_verif/_dce_textes/${code}.txt`, 'utf-8');
const analyse = analyseF ? JSON.parse(fs.readFileSync(analyseF, 'utf-8')) : {};
console.log(JSON.stringify(b.sitesDuMarche(analyse, dce)), b.marcheHorsNormandie(analyse, dce));
