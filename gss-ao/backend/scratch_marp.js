const fs = require('fs');
const path = '/Users/clarencegomis/memoiretechnique/GSS-new/gss-ao/backend/src/generation/memoire_generator.ts';
let content = fs.readFileSync(path, 'utf8');

// Insert Marp import
if (!content.includes('MarpGenerator')) {
    content = "import { MarpGenerator } from './marp_generator';\n" + content;
}

const target = `  public async exportFromSectionsMap(
    sectionsMap: Record<string, string>,
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    const chapters: AssembleChapter[] = CHAPTER_ORDER_B.map((ch) => ({
      key: ch,
      title: CHAPTER_TITLES_B[ch],
      sections: AI_SECTIONS_B
        .filter((s) => s.chapter === ch && sectionsMap[s.id]?.trim())
        .map((s) => ({ title: s.title, text: sectionsMap[s.id] })),
    }));

    if (chapters.every((c) => c.sections.length === 0)) {
      throw new Error('Aucune section générée à exporter (map vide ou ids inconnus).');
    }

    const cover = await this.getCoverInfo('export');
    const generator = new MarpGenerator(this.responseDir);
    const result = generator.generatePdf(chapters, cover);
    
    return { filePath: result.filePath, generatedData: {} };
  }`;

// I will replace exportFromSectionsMap entirely.
const startMarker = '  public async exportFromSectionsMap(';
const startIndex = content.indexOf(startMarker);

// Find the end of exportFromSectionsMap. It's the last method in the file before the class closing brace.
// Let's just find the closing brace of exportFromSectionsMap
const endIndex = content.indexOf('  }', startIndex) + 3; 

if (startIndex !== -1) {
    // Just slice it out and replace
    const before = content.slice(0, startIndex);
    const after = content.slice(content.indexOf('}', content.indexOf('return this.assembleFromSections', startIndex)) + 1);
    
    // Actually just string replace the method body
    const oldMethod = `  public async exportFromSectionsMap(
    sectionsMap: Record<string, string>,
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    const chapters: AssembleChapter[] = CHAPTER_ORDER_B.map((ch) => ({
      key: ch,
      title: CHAPTER_TITLES_B[ch],
      sections: AI_SECTIONS_B
        .filter((s) => s.chapter === ch && sectionsMap[s.id]?.trim())
        .map((s) => ({ title: s.title, text: sectionsMap[s.id] })),
    }));

    if (chapters.every((c) => c.sections.length === 0)) {
      throw new Error('Aucune section générée à exporter (map vide ou ids inconnus).');
    }

    return this.assembleFromSections('export', chapters);
  }`;
  
    content = content.replace(oldMethod, target);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Marp replaced successfully!");
}
