require('dotenv').config({ path: '../gss-ao/.env' });
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { OpenAI } = require('openai');
const { execSync } = require('child_process');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function processDocx(filename) {
  console.log('1. Extracting text from DOCX...');
  const result = await mammoth.extractRawText({ path: filename });
  const rawText = result.value;
  console.log(`Extracted ${rawText.length} characters.`);

  // Limit text if it's too huge (just in case), but GPT-4o context is 128k, so 20k chars is very safe.
  const textToProcess = rawText.slice(0, 50000); 

  console.log('2. Sending to OpenAI for restructuring into Marp Markdown...');
  const prompt = `
Tu es un expert en design de présentation et consultant en réponse aux appels d'offres.
Voici le texte brut (et mal organisé) d'un Mémoire Technique (société GSS Sécurité).
Ton but est de réorganiser ce contenu de façon claire, aérée, et professionnelle, sous forme de slides pour Marp.

Règles strictes pour Marp :
- Utilise "---" pour séparer chaque slide (page).
- Tout en haut du fichier, tu DOIS commencer par cet entête YAML :
---
marp: true
theme: gss
---

- Utilise "<!-- _class: lead -->" pour la première slide (page de garde) avec le titre du document.
- Utilise "<!-- _class: intercalaire -->" pour les slides de transition (ex: grand titre de chapitre).
- N'hésite pas à synthétiser un peu ou restructurer avec des bullet points pour rendre la lecture agréable.
- Mets les éléments importants en évidence avec "<strong>...</strong>" ou "**...**".
- Si tu vois un concept fort, mets le dans une div box : "<div class='box'>...</div>".
- Ne génère aucun code HTML complexe autre que la div box, reste sur du Markdown pur.

Texte Brut :
${textToProcess}
  `;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Tu es un expert en présentation Markdown Marp.' },
      { role: 'user', content: prompt }
    ]
  });

  const markdownContent = completion.choices[0].message.content;
  
  // Clean markdown block wrapper if any
  let cleanMarkdown = markdownContent;
  if (cleanMarkdown.startsWith('```markdown')) {
    cleanMarkdown = cleanMarkdown.replace(/^```markdown\n/, '').replace(/\n```$/, '');
  }

  const mdFilename = filename.replace('.docx', '.md');
  fs.writeFileSync(mdFilename, cleanMarkdown);
  console.log(`3. Marp Markdown generated and saved to ${mdFilename}`);

  console.log('4. Generating PDF with Marp...');
  const pdfFilename = filename.replace('.docx', '.pdf');
  
  // Exécute Marp CLI
  execSync(`npx @marp-team/marp-cli "${mdFilename}" --theme gss-theme.css -o "${pdfFilename}" --allow-local-files`, { stdio: 'inherit' });
  
  console.log(`\n✅ Terminé ! Le PDF magnifiquement mis en page a été généré : ${pdfFilename}`);
}

const targetFile = 'Mémoire technique GSS_1781976509071.docx';
processDocx(targetFile).catch(console.error);
