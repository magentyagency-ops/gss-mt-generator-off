const fs = require('fs');

const resolverPath = 'backend/src/generation/missing_info_resolver.ts';
let resolverContent = fs.readFileSync(resolverPath, 'utf8');

// Add import for D2Service if not present
if (!resolverContent.includes('D2Service')) {
  resolverContent = resolverContent.replace(
    "import { getSettings }",
    "import { getSettings }\nimport { D2Service } from './d2_service';"
  );
}

// Add the function at the end
const generateFunc = `
/**
 * Génération automatique des schémas d'architecture D2 pour les sections les plus pertinentes (~15)
 * Centralisé ici pour la gestion des appels IA.
 */
export async function generateD2SchemasForChapters(
  chapters: any[], 
  clientName: string,
  onProgress?: (pct: number, msg: string) => void
): Promise<void> {
  onProgress?.(91, 'Génération des schémas d\\'architecture D2…');
  const D2_ELIGIBLE_SECTIONS = [
    'b_implantation', 'b_moyens_humains', 'b_encadrement',
    'b_recrutement_formation', 'b_dispositif_absence',
    'b_moyens_materiels', 'b_rondes', 'b_controle_acces', 'b_telesurveillance',
    'b_gestion_alarmes', 'b_organisation', 'b_planning',
    'b_suivi_qualite', 'b_procedures', 'b_amelioration'
  ];

  const d2Promises: Promise<void>[] = [];
  for (const chapter of chapters) {
    if (!chapter.sections) continue;
    for (const sec of chapter.sections) {
      if (!sec.d2Code && sec.text && sec.text.length > 100 && sec.id && D2_ELIGIBLE_SECTIONS.includes(sec.id)) {
        d2Promises.push((async () => {
          try {
            const d2Code = await D2Service.generateD2Code(sec.title, sec.text, clientName);
            console.log("===== D2 GENERATED =====");
            console.log("Section :", sec.title);
            console.log(d2Code);
            console.log("========================");

            if (d2Code) sec.d2Code = d2Code;
          } catch (e: any) {
            console.warn(\`[MissingInfoResolver] Génération D2 ignorée pour \${sec.title}:\`, e.message || e);
          }
        })());
      }
    }
  }
  
  if (d2Promises.length > 0) {
    await Promise.all(d2Promises);
  }
}
`;

if (!resolverContent.includes('generateD2SchemasForChapters')) {
  resolverContent += generateFunc;
  fs.writeFileSync(resolverPath, resolverContent);
  console.log("Updated missing_info_resolver.ts");
}

const memoirePath = 'backend/src/generation/memoire_generator.ts';
let memoireContent = fs.readFileSync(memoirePath, 'utf8');

// Add import
if (!memoireContent.includes('generateD2SchemasForChapters')) {
  memoireContent = memoireContent.replace(
    "import { resolveMissingInfo } from './missing_info_resolver';",
    "import { resolveMissingInfo, generateD2SchemasForChapters } from './missing_info_resolver';"
  );
}

// Replace the block
const startMarker = "// Génération automatique des schémas d'architecture D2 pour les sections les plus pertinentes (~15)";
const endMarker = "// Bibliothèque d'images (base de données) : on charge le pool, puis on attribue";

const startIdx = memoireContent.indexOf(startMarker);
const endIdx = memoireContent.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
  const before = memoireContent.substring(0, startIdx);
  const after = memoireContent.substring(endIdx);
  
  const callReplacement = `// Génération automatique des schémas d'architecture D2 via missing_info_resolver (centralisation IA)
    await generateD2SchemasForChapters(chapters, cover.client, onProgress);

    `;
  memoireContent = before + callReplacement + after;
  fs.writeFileSync(memoirePath, memoireContent);
  console.log("Updated memoire_generator.ts");
} else {
  console.log("Could not find markers in memoire_generator.ts");
}
