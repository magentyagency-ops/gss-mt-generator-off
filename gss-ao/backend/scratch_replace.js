const fs = require('fs');
const path = '/Users/clarencegomis/memoiretechnique/GSS-new/gss-ao/backend/src/generation/memoire_generator.ts';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '  public async assembleFromSections(';
const endMarker = '  /**\n   * Export DOCX du cas "sans cadre imposé"';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `  public async assembleFromSections(
    dossierId: string,
    chapters: AssembleChapter[],
    options: { refonte?: boolean, clearOriginalSpreads?: boolean } = {},
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    // 0. Client (base DCE puis analyse) pour personnaliser la couverture
    const cover = await this.getCoverInfo(dossierId);
    
    // Import de MarpGenerator
    const { MarpGenerator } = require('./marp_generator');
    const generator = new MarpGenerator(this.responseDir);
    
    const result = generator.generatePdf(chapters, cover);
    
    return {
        filePath: result.filePath,
        generatedData: {}
    };
  }

`;
    content = content.slice(0, startIndex) + replacement + content.slice(endIndex);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Replacement successful!");
} else {
    console.error("Markers not found!");
    console.log("Start:", startIndex, "End:", endIndex);
}
