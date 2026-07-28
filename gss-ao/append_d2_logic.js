const fs = require('fs');
const path = require('path');

const resolverPath = 'backend/src/generation/missing_info_resolver.ts';
let resolverContent = fs.readFileSync(resolverPath, 'utf8');

// Ensure import for fs and path are there if we compile to SVG locally
if (!resolverContent.includes("import fs from 'fs'")) {
  resolverContent = `import fs from 'fs';\nimport path from 'path';\n` + resolverContent;
}

const fullD2Logic = `
/**
 * ============================================================================
 * LOGIQUE DE GÉNÉRATION DES SCHÉMAS D2 (CENTRALISÉE ICI PAR IA)
 * ============================================================================
 */

const D2_SYSTEM_PROMPT = \`Tu es un expert en conception de diagrammes D2 et schémas d'architecture pour le mémoire technique de GSS Sécurité.
Tu dois générer du code D2 valide, lisible et parfaitement mis en page.

Règles de rendu et de syntaxe STRICTES (CONFORMITÉ D2) :
1. GLOBAL : Imposer "direction: down" au début du fichier.
2. GUILLEMETS OBLIGATOIRES : Si le libellé d'un nœud contient des espaces, des parenthèses, des virgules ou des caractères spéciaux, il DOIT IMPÉRATIVEMENT être entouré de doubles guillemets.
   - CORRECT : \\\"N1\\\": \\\"Agent de sécurité (CQP APS)\\\"
   - INCORRECT : N1: Agent de sécurité (CQP APS) (Fait planter le compilateur avec "unexpected text")
3. BLOC STYLE OBLIGATOIRE : TOUT attribut de style (font-size, stroke-width, fill, etc.) DOIT être imbriqué dans un sous-bloc style: { ... }. Ne JAMAIS mettre font-size directement dans le nœud !
   - CORRECT : N1: \\\"Titre\\\" { style: { font-size: 28; stroke-width: 2 } }
   - INCORRECT : N1: \\\"Titre\\\" { font-size: 28 } (Fait planter le compilateur)
4. TAILLES DE POLICES (dans le bloc style) :
   - Noeuds / Boîtes : font-size: 28 ou plus.
   - Liens / Flèches : font-size: 20.
5. Syntaxe D2 stricte : stroke-width DOIT être un ENTIER (1, 2, 3) dans le bloc style. JAMAIS de nombre à virgule.
6. Répartition du texte : Utilise systématiquement \\\\\\\\n à l'intérieur des guillemets pour couper les longs textes.
7. Topologie arborescente (Tree Layout) : Racine -> branches parallèles. Évite les longues chaînes horizontales.
8. Ne renvoie AUCUN texte d'introduction ni d'explication. Renvoie UNIQUEMENT le bloc de code D2 valide.\`;

async function compileD2ToSvg(d2Code: string): Promise<Buffer> {
  const cleanD2 = d2Code
    .replace(/^\\s*\`\`\`d2/gm, '')
    .replace(/^\\s*\`\`\`/gm, '')
    .trim();

  const response = await fetch('https://kroki.io/d2/svg', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: cleanD2,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(\`Erreur compilation Kroki D2 SVG (\${response.status}): \${errText}\`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateD2SchemasForChapters(
  chapters: any[], 
  clientName: string,
  mediaDir: string,
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

  const key = getSettings().openaiApiKey;
  if (!key) {
    console.warn('[D2] Aucune clé OpenAI, schémas ignorés.');
    return;
  }
  const openai = new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS });

  const d2Promises: Promise<void>[] = [];
  let schemaCount = 0;

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    if (!chapter.sections) continue;
    for (let si = 0; si < chapter.sections.length; si++) {
      const sec = chapter.sections[si];
      if (!sec.d2SvgFileName && sec.text && sec.text.length > 100 && sec.id && D2_ELIGIBLE_SECTIONS.includes(sec.id)) {
        d2Promises.push((async () => {
          try {
            const prompt = \`Génère un schéma D2 hautement pertinent et personnalisé pour la section du mémoire technique suivante :
Client / Bénéficiaire : \${clientName}
Titre de la section : \${sec.title}
Contenu de la section :
\${sec.text.slice(0, 1500)}

Le schéma doit illustrer le processus, la structure d'équipe, l'architecture technique ou le plan de prévention GSS adapté à cette section.
Respecte scrupuleusement les consignes de format D2 (direction: down, polices géantes dans les blocs style, utilisation des guillemets pour les textes, stroke-width entier, \\\\\\\\n pour les textes).\`;

            const response = await openai.chat.completions.create({
              model: process.env.MEMOIRE_MODEL || 'gpt-4o-mini',
              messages: [
                { role: 'system', content: D2_SYSTEM_PROMPT },
                { role: 'user', content: prompt },
              ],
              temperature: 0.3,
            });

            const raw = response.choices[0]?.message?.content || '';
            const d2Code = raw
              .replace(/^\\s*\`\`\`d2/gm, '')
              .replace(/^\\s*\`\`\`/gm, '')
              .trim();

            if (d2Code) {
              const svgBuffer = await compileD2ToSvg(d2Code);
              const fileName = \`schema_\${ci}_\${si}.svg\`;
              const filePath = path.join(mediaDir, fileName);
              fs.writeFileSync(filePath, svgBuffer);
              sec.d2SvgFileName = fileName;
              schemaCount++;
              console.log(\`[D2] Schéma généré et compilé : \${fileName} (\${sec.title})\`);
            }
          } catch (e: any) {
            console.warn(\`[D2] Échec pour \${sec.title}:\`, e.message || e);
          }
        })());
      }
    }
  }
  
  if (d2Promises.length > 0) {
    await Promise.all(d2Promises);
    console.log(\`[D2] \${schemaCount} schémas générés au total.\`);
  }
}
`;

fs.writeFileSync(resolverPath, resolverContent + fullD2Logic);
console.log("Injected D2 logic into missing_info_resolver.ts");
