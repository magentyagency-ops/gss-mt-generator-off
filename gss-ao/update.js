const fs = require('fs');
const file = 'backend/src/generation/memoire_generator.ts';
let c = fs.readFileSync(file, 'utf8');
const lines = c.split('\n');

const fixLines = [
  "    let detected: { fields: MissingFieldDetected[]; total: number; exigences?: any[] };",
  "    if (templateText) {",
  "      const viaRag = await this.detectMissingViaRag(requirements);",
  "      detected = viaRag ?? await this.judgeTemplateFieldsVsRag(requirements, gssContext);",
  "      console.log(`[MemoireGenerator] detectMissing DIAG : cadre RAG -> ${detected.fields.length} à compléter / ${detected.total} champs.`);"
];

// Let's find exactly the line `if (templateText) {`
let targetIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('if (templateText) {') && lines[i-1].includes('requirements.length}')) {
    targetIdx = i - 1; // Wait, let detected was above if (templateText)
    break;
  }
}

if (targetIdx !== -1) {
  // It's currently:
  // console.log(...)
  // if (templateText) {
  // const viaRag...
  // detected = viaRag...
  // console.log(cadre RAG)
  // console.log(cadre holistique)
  // } else {
  
  // So we just replace from targetIdx + 1 down to `} else {`
  let endIdx = -1;
  for (let i = targetIdx + 1; i < lines.length; i++) {
    if (lines[i].includes('    } else {')) {
      endIdx = i;
      break;
    }
  }
  
  if (endIdx !== -1) {
    lines.splice(targetIdx + 1, endIdx - (targetIdx + 1), ...fixLines);
    fs.writeFileSync(file, lines.join('\n'));
    console.log("Fixed!");
  } else {
    console.log("End not found!");
  }
} else {
  console.log("Target not found!");
}
