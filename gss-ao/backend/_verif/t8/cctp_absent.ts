// Tour 8 (T8-COH-2) : alerte « DCE sans CCTP » sur des textes de DCE (fichiers : corpus ou texte assemblé par le générateur).
const fs = require('fs');
const { alerteCctpAbsent } = require('../../src/generation/memoire_generator');
for (const f of process.argv.slice(2)) console.log(f.split('/').pop(), JSON.stringify(alerteCctpAbsent(fs.readFileSync(f, 'utf-8'))));
