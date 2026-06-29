const fs = require('fs');

const dstFile = 'c:/Users/linal/GSSCLARENCE/gss-ao/backend/src/generation/memoire_generator.ts';
let code = fs.readFileSync(dstFile, 'utf8');

// 1. Add MarpGenerator import if missing
if (!code.includes("import { MarpGenerator }")) {
  code = "import { MarpGenerator } from './marp_generator';\n" + code;
}

// 2. Fix the variable redeclaration 'missing'
// Let's replace 'const missing =' with 'const missingInfo ='
// and 'missing.length' with 'missingInfo.length'
// and 'missingFields: missing' with 'missingFields: missingInfo'
code = code.replace(/const missing = replacements/g, "const missingInfo = replacements");
code = code.replace(/if \(missing\.length > 0\)/g, "if (missingInfo.length > 0)");
code = code.replace(/missingFields: missing/g, "missingFields: missingInfo");

// 3. Remove generateSynthesisPdf completely
// It starts with 'public async generateSynthesisPdf' and goes until just before 'public async generateFullMarpPdf'
const synthRegex = /public async generateSynthesisPdf[\s\S]*?(?=public async generateFullMarpPdf)/;
code = code.replace(synthRegex, "");

fs.writeFileSync(dstFile, code);
console.log("Cleanup script executed!");
