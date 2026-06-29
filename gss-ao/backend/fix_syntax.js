const fs = require('fs');
const dstFile = 'c:/Users/linal/GSSCLARENCE/gss-ao/backend/src/generation/memoire_generator.ts';
const code = fs.readFileSync(dstFile, 'utf8');
const lines = code.split('\n');

// Find the line containing `return { status: 'incomplete', missingFields: missing };`
let targetIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("return { status: 'incomplete', missingFields: missing };")) {
    targetIndex = i;
    break;
  }
}

if (targetIndex !== -1) {
  // We expect lines targetIndex+1, targetIndex+2, targetIndex+3 to be the leftover block
  // Just to be safe, delete them.
  lines.splice(targetIndex + 2, 3); 
  // targetIndex is `return ...`
  // targetIndex + 1 is `    }`
  // targetIndex + 2 is ` complété(s) [stub web/email — non implémenté].`);`
  // targetIndex + 3 is `      }`
  // targetIndex + 4 is `    }`
  fs.writeFileSync(dstFile, lines.join('\n'));
  console.log("Syntax fixed!");
} else {
  console.log("Could not find target line.");
}
