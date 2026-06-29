const fs = require('fs');

const srcFile = 'c:/Users/linal/gss/gss-ao/backend/src/generation/memoire_generator.ts';
const dstFile = 'c:/Users/linal/GSSCLARENCE/gss-ao/backend/src/generation/memoire_generator.ts';

const srcCode = fs.readFileSync(srcFile, 'utf8');
let dstCode = fs.readFileSync(dstFile, 'utf8');

// The missing items reported by tsc:
const missingMethods = [
  'memoireModel',
  'MODEL_TEMPLATE',
  'buildFullGssContext',
  'getGssReferents',
  'getGssTotalEffectif',
  'buildRetrievalChunks',
  'embedChunks',
  'embedTexts',
  'buildFieldQuery',
  'retrieve',
  'headerTokens',
  'lastDceSiteCols',
  'lastDceTables',
  'identiteCandidatForLabel',
  'GSS_IDENTITE'
];

const missingGlobalFunctions = [
  'detectMarketType',
  'detectClientSector',
  'buildStrategicContext',
  'RetrievalChunk' // Interface
];

// 1. We will simply replace the whole MemoireGenerator class with the one from gss,
// BUT we keep the MARP logic and MissingInfo chat logic.
// This is much safer than cherry-picking 20 different methods and properties.

// Extract the GSSCLARENCE MARP + Chat logic (everything after generateFullMarpPdf starts, up to the end of the class)
const marpAndChatRegex = /public async generateFullMarpPdf[\s\S]*?(?=\n\}\s*$)/;
const marpAndChatMatch = dstCode.match(marpAndChatRegex);
if (!marpAndChatMatch) {
  console.error("Could not find MARP logic in destination!");
  process.exit(1);
}
const marpAndChatCode = marpAndChatMatch[0];

// Extract GSSCLARENCE's imports to keep any new ones (like MarpGenerator)
const dstImports = dstCode.substring(0, dstCode.indexOf('export class MemoireGenerator'));

// Get the pristine gss code
// We will replace its 'generate' method signature to include onProgress and missingFields
// We will replace 'generateSynthesisPdf' with 'generateFullMarpPdf'
// We will replace the RESOLVE_MISSING_INFO logic with the interactive state saving

let patchedGssCode = srcCode;

patchedGssCode = patchedGssCode.replace(
  /public async generate\(dossierId: string\): Promise<\{ filePath: string, generatedData: Record<string, string> \}> \{/,
  `public async generate(
    dossierId: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<{
    status?: 'completed' | 'incomplete';
    filePath?: string;
    generatedData?: Record<string, string>;
    missingFields?: any[];
  }> {`
);

patchedGssCode = patchedGssCode.replace(
  /setProgress\(dossierId, \{ phase: 'analyse', pct: 12, label: 'Analyse du DCE terminée' \}\);/g,
  `if (onProgress) onProgress(12, 'Analyse du DCE terminée');`
);

patchedGssCode = patchedGssCode.replace(
  /return this\.generateSynthesisPdf\(dossierId\);/g,
  `return this.generateFullMarpPdf(dossierId);`
);

const missingInfoRegex = /if \(process\.env\.RESOLVE_MISSING_INFO === 'true'\) \{[\s\S]*?console\.log[\s\S]*?\}[\s\S]*?\}/;
const missingLogic = `
    const missing = replacements
      .filter((r: any) => /\\[À COMPLÉTER\\]/.test(String(r.value)))
      .map((r: any) => {
        const d = descriptors.find((x: any) => x.id === r.id);
        const label = (d?.context.match(/Question:\\s*"([^"]*)"|option:\\s*"([^"]*)"|Tableau:\\s*([^|]*)/) || [])
          .slice(1).find(Boolean) || d?.context || '';
        return { id: r.id, label: String(label).trim(), context: d?.context || '' };
      });

    if (missing.length > 0) {
      const tempPath = require('path').join(this.responseDir, \`temp_\${dossierId}.docx\`);
      const tempSerializer = new XMLSerializer();
      zip.file('word/document.xml', tempSerializer.serializeToString(xmlDoc));
      const tempBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
      require('fs').writeFileSync(tempPath, tempBuf);

      DB.saveDossier(dossierId, {
        memoire_cadre_state: { tempPath, missingFields: missing }
      });
      return { status: 'incomplete', missingFields: missing };
    }
`;
patchedGssCode = patchedGssCode.replace(missingInfoRegex, missingLogic);

patchedGssCode = patchedGssCode.replace(
  /return \{\s*filePath: outputPath,\s*generatedData: \{/,
  `return {
      status: 'completed',
      filePath: outputPath,
      generatedData: {`
);

// Now insert MARP and Chat logic right before the closing brace of the MemoireGenerator class in gss code
patchedGssCode = patchedGssCode.replace(
  /(public async generateSynthesisPdf[\s\S]*?\n  \})[\s\S]*?(?=\n\}\s*$)/,
  `$1\n\n  ${marpAndChatCode}`
);

// Add missing imports (like MarpGenerator) if not present
if (!patchedGssCode.includes('MarpGenerator')) {
  patchedGssCode = "import { MarpGenerator } from './marp_generator';\n" + patchedGssCode;
}

fs.writeFileSync(dstFile, patchedGssCode);
console.log("Successfully rebuilt memoire_generator.ts with all helpers and MARP!");
