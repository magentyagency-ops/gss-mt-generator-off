const fs = require('fs');
const resolverPath = 'backend/src/generation/missing_info_resolver.ts';
let lines = fs.readFileSync(resolverPath, 'utf8').split('\n');

const outLines = [];
let foundBracket = false;

for (let i = 0; i < lines.length; i++) {
  if (!foundBracket && lines[i].trim() === '}' && lines[i-1] && lines[i-1].trim() === '') {
    if (lines[i-2] && lines[i-2].trim() === '}') {
      // It's the double bracket
      foundBracket = true;
      continue; // skip this bracket
    }
  }
  outLines.push(lines[i]);
}

fs.writeFileSync(resolverPath, outLines.join('\n'));
console.log("Fixed brackets");
