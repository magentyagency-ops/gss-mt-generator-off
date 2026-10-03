// Tour 8 (T8CS-5) : alerte « cadre du mémoire absent » sur le texte du DCE tel que le générateur l'assemble (fichier) ou du corpus.
const fs = require('fs');
const { alerteCadreAbsent } = require('../../src/generation/memoire_generator');
for (const f of process.argv.slice(2)) console.log(f.split('/').pop(), JSON.stringify(alerteCadreAbsent(fs.readFileSync(f, 'utf-8'))));
