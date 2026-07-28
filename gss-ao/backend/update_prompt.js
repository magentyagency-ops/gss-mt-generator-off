const fs = require('fs');

const path = 'c:/Users/linal/GSSCLARENCE/gss-ao/backend/src/generation/memoire_generator.ts';
let content = fs.readFileSync(path, 'utf8');

const target = '- Ignore les cases DÉJÀ cochées et les zones déjà renseignées.",';
const replacement = `- Ignore les cases DÉJÀ cochées et les zones déjà renseignées.\\n" +
              "- IGNORE ABSOLUMENT tous les champs liés à la signature, date et lieu de signature (ex: 'Fait à', 'Le', 'Signature', 'Nom et qualité du signataire', 'Cachet').",`;

content = content.replace(target, replacement);

fs.writeFileSync(path, content);
console.log('Done!');
