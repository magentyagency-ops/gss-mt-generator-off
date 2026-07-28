const fs = require('fs');
let lines = fs.readFileSync('backend/src/generation/missing_info_resolver.ts', 'utf8').split('\n');
let index = -1;
for(let i = 0; i < lines.length; i++) {
  if(lines[i].includes('const D2_SYSTEM_PROMPT =')) {
    index = i;
    break;
  }
}
if(index !== -1) {
  // look backwards for the extra '}'
  for(let i = index - 1; i >= 0; i--) {
    if(lines[i].trim() === '}') {
      if(lines[i-1] && lines[i-1].trim() === '') {
         // this is the extra bracket
         lines.splice(i, 1);
         break;
      }
    }
  }
}
fs.writeFileSync('backend/src/generation/missing_info_resolver.ts', lines.join('\n'));
console.log('Fixed brackets in missing_info_resolver.ts');
