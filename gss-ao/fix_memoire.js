const fs = require('fs');

const memoirePath = 'backend/src/generation/memoire_generator.ts';
let memoireContent = fs.readFileSync(memoirePath, 'utf8');

const targetLine = "    onProgress?.(92, 'Chargement des images de la bibliothèque…');";
const callReplacement = `    // Génération automatique des schémas d'architecture D2 via missing_info_resolver (centralisation IA)
    await generateD2SchemasForChapters(chapters, cover.client, onProgress);

    onProgress?.(92, 'Chargement des images de la bibliothèque…');`;

if (memoireContent.includes(targetLine) && !memoireContent.includes('await generateD2SchemasForChapters')) {
  memoireContent = memoireContent.replace(targetLine, callReplacement);
  fs.writeFileSync(memoirePath, memoireContent);
  console.log("Updated memoire_generator.ts");
} else {
  console.log("Could not find target line in memoire_generator.ts or already injected");
}
