require('dotenv').config({ path: '../gss-ao/.env' });
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const CATALOG = JSON.parse(fs.readFileSync('assets/catalog.json', 'utf8'));

const systemPrompt = `
Tu es un concepteur de documents professionnels pour GSS Sécurité.
Ta mission est d'insérer intelligemment des icônes et des illustrations issues de notre catalogue d'assets dans le document Markdown de Mémoire Technique fourni.

Voici les règles pour insérer les assets :
1. Icônes Lucide : Utilise la balise HTML \`<img src="assets/icons/NOM.svg" class="icon" />\` juste avant un titre, sous-titre ou un élément de liste important.
   Exemple : \`## <img src="assets/icons/shield.svg" class="icon" /> 1. Nos Valeurs\`
   Liste des icônes disponibles : ${CATALOG.icons.map(i => i.name).join(', ')}.

2. Images d'illustrations (Unsplash) : Utilise la syntaxe Markdown \`![class:illustration-right](assets/images/ID.jpg)\` pour insérer une image d'illustration discrète alignée à droite du texte (c'est le format recommandé). Si l'image doit vraiment couper deux grands paragraphes, utilise \`![class:illustration-center](assets/images/ID.jpg)\` (plus rare). N'ajoute pas plus de 1 ou 2 images par section pour garder un design aéré et discret.
   Liste des images disponibles (choisis l'ID pertinent par rapport au sujet) :
   ${CATALOG.images.map(img => `- ID : ${img.id} (${img.description})`).join('\n')}

3. Ne modifie les textes originaux sous aucun prétexte. Ajoute uniquement les icônes et les illustrations à des endroits appropriés. Sois sélectif pour garder un style pro (pas plus de 1 ou 2 icônes par chunk de texte, et une image d'illustration seulement si le sujet s'y prête vraiment).

4. RÈGLE CRITIQUE : Tu dois retourner STRICTEMENT le contenu Markdown enrichi et RIEN D'AUTRE. Aucune phrase d'introduction ou de conclusion (ex: "Voici le document...").
`;

async function processChunk(chunkText, chunkIndex) {
  console.log(`Sending chunk starting at slide ${chunkIndex} to OpenAI...`);
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Voici une partie du document Markdown à embellir avec des illustrations :\n\n${chunkText}` }
    ],
    temperature: 0.1
  });

  let result = completion.choices[0].message.content;
  const mdMatch = result.match(/```(?:markdown)?\n([\s\S]*?)\n```/);
  if (mdMatch) {
    result = mdMatch[1];
  }
  console.log(`✓ Chunk starting at slide ${chunkIndex} completed.`);
  return result;
}

async function main() {
  console.log('Reading document and splitting into slides...');
  const doc = fs.readFileSync('memoire_marp_vertical.md', 'utf8');
  
  const slides = doc.split(/\n---\n/);
  console.log(`Loaded ${slides.length} slides.`);

  const chunkSize = 12; // Larger chunk size to reduce number of parallel requests
  const promises = [];

  // Keep slide 0 (YAML header) separate
  const headerSlide = slides[0];

  for (let i = 1; i < slides.length; i += chunkSize) {
    const chunk = slides.slice(i, i + chunkSize);
    const chunkText = chunk.join('\n---\n');
    promises.push(processChunk(chunkText, i));
  }

  console.log(`Launching ${promises.length} parallel requests to OpenAI...`);
  const enrichedChunks = await Promise.all(promises);

  // Re-assemble
  const finalMarkdown = [headerSlide, ...enrichedChunks].join('\n---\n');
  fs.writeFileSync('memoire_marp_vertical_enriched.md', finalMarkdown);
  console.log('Enriched markdown saved to memoire_marp_vertical_enriched.md');
}

main().catch(console.error);
