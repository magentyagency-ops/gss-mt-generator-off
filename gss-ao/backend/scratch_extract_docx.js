const fs = require('fs');
const mammoth = require('mammoth');
const path = require('path');

const docxPath = '/Users/clarencegomis/memoiretechnique/GSS-new/Template/Mémoire technique/AO RNE.docx';
const outputPath = path.resolve(__dirname, 'scratch_ao_rne.md');

async function extract() {
  const result = await mammoth.convertToHtml({ path: docxPath });
  const html = result.value;
  
  // A simple HTML to Markdown converter tailored for this document
  let md = html
    .replace(/<h1>(.*?)<\/h1>/g, '\n# $1\n')
    .replace(/<h2>(.*?)<\/h2>/g, '\n## $1\n')
    .replace(/<h3>(.*?)<\/h3>/g, '\n### $1\n')
    .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, ''); // strip remaining tags
    
  fs.writeFileSync(outputPath, md, 'utf-8');
  console.log(`Extracted to ${outputPath}`);
}

extract().catch(console.error);
