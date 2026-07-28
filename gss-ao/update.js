const fs = require('fs');
const file = 'backend/src/generation/memoire_generator.ts';
let c = fs.readFileSync(file, 'utf8');
const lines = c.split('\n');

// Update DETECTION_VERSION
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const DETECTION_VERSION = 2;')) {
    lines[i] = lines[i].replace('const DETECTION_VERSION = 2;', 'const DETECTION_VERSION = 3;');
    break;
  }
}

const fixLines = [
  "    if (templateText) {",
  "      const viaRag = await this.detectMissingViaRag(requirements);",
  "      detected = viaRag ?? await this.judgeTemplateFieldsVsRag(requirements, gssContext);",
  "      console.log(`[MemoireGenerator] detectMissing DIAG : cadre RAG -> ${detected.fields.length} à compléter / ${detected.total} champs.`);"
];

let targetIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('if (templateText) {') && lines[i-1].includes('let detected:')) {
    targetIdx = i;
    break;
  }
}

if (targetIdx !== -1) {
  let endIdx = -1;
  for (let i = targetIdx + 1; i < lines.length; i++) {
    if (lines[i].includes('    } else {')) {
      endIdx = i;
      break;
    }
  }
  
  if (endIdx !== -1) {
    lines.splice(targetIdx, endIdx - targetIdx, ...fixLines);
    fs.writeFileSync(file, lines.join('\n'));
    console.log("Fixed memoire_generator.ts!");
  } else {
    console.log("End not found!");
  }
} else {
  console.log("Target not found!");
}
