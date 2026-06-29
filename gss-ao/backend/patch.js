const fs = require('fs');
const path = require('path');

const srcFile = 'c:/Users/linal/gss/gss-ao/backend/src/generation/memoire_generator.ts';
const dstFile = 'c:/Users/linal/GSSCLARENCE/gss-ao/backend/src/generation/memoire_generator.ts';

const srcCode = fs.readFileSync(srcFile, 'utf8');
const dstCode = fs.readFileSync(dstFile, 'utf8');

const srcLines = srcCode.split('\n');
const dstLines = dstCode.split('\n');

// Extract generate from gss
let gssGenerate = srcLines.slice(2151, 3262).join('\n');

// Replace signature
gssGenerate = gssGenerate.replace(
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

// Add onProgress calls
gssGenerate = gssGenerate.replace(
  /setProgress\(dossierId, \{ phase: 'analyse', pct: 12, label: 'Analyse du DCE terminée' \}\);/g,
  `if (onProgress) onProgress(12, 'Analyse du DCE terminée');`
);

// Replace generateSynthesisPdf with generateFullMarpPdf
gssGenerate = gssGenerate.replace(
  /return this\.generateSynthesisPdf\(dossierId\);/g,
  `return this.generateFullMarpPdf(dossierId);`
);

// Replace RESOLVE_MISSING_INFO logic with state saving and early return
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
      fs.writeFileSync(tempPath, tempBuf);

      DB.saveDossier(dossierId, {
        memoire_cadre_state: { tempPath, missingFields: missing }
      });
      return { status: 'incomplete', missingFields: missing };
    }
`;
gssGenerate = gssGenerate.replace(missingInfoRegex, missingLogic);

// Fix return
gssGenerate = gssGenerate.replace(
  /return \{\s*filePath: outputPath,\s*generatedData: \{/,
  `return {
      status: 'completed',
      filePath: outputPath,
      generatedData: {`
);

// Replace the generate function in GSSCLARENCE
// From line 1332 to 1869 (indexes 1331 to 1868)
let newDstCode = dstLines.slice(0, 1331).join('\n') + '\n' + gssGenerate + '\n' + dstLines.slice(1870).join('\n');

fs.writeFileSync(dstFile, newDstCode);
console.log('Patched cleanly!');
