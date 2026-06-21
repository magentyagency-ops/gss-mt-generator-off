const fs = require('fs');

function splitToMarp(inputPath, outputPath) {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n');

  let result = `---
marp: true
theme: gss
size: a4
paginate: true
header: 'GLOBAL SECURITY SERVICES'
---

<!-- _class: lead -->

# GLOBAL SECURITY SERVICES
## VOTRE PARTENAIRE SECURITE
### MÉMOIRE TECHNIQUE
#### SECURITE INCENDIE & SÛRETE

---
`;

  let currentPageText = '';
  let currentH1 = 'MÉMOIRE TECHNIQUE';
  let currentH2 = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Remove old anchor links like <a id="..."></a> to clean up the text
    line = line.replace(/<a id="[^"]+"><\/a>/g, '');
    line = line.replace(/<a id="[^"]+">/g, '');

    // Skip empty lines at the very beginning of a page
    if (currentPageText.length === 0 && line.trim() === '') {
      continue;
    }

    // Check for Headings
    const isH1 = line.startsWith('# ');
    const isH2 = line.startsWith('## ');
    const isH3 = line.startsWith('### ');
    const isH6 = line.startsWith('###### ');

    // If it's a heading and we already have content on the current page, split!
    if ((isH1 || isH2 || isH3 || isH6) && currentPageText.trim().length > 0) {
      result += currentPageText.trim() + '\n\n---\n\n';
      currentPageText = '';
    }

    // Track current headings to carry them over to header
    if (isH1) {
      currentH1 = line.replace('# ', '').trim();
      currentH2 = '';
    } else if (isH2) {
      currentH2 = line.replace('## ', '').trim();
    }

    // Set the slide header directive at the top of a new slide
    if (currentPageText.length === 0) {
      const headerTitle = `${currentH1}${currentH2 ? ' - ' + currentH2 : ''}`;
      // Clean potential html elements from header string
      const cleanHeaderTitle = headerTitle.replace(/\\/g, '').trim();
      currentPageText += `<!-- header: "${cleanHeaderTitle}" -->\n\n`;
    }

    currentPageText += line + '\n';

    // If the page gets too long, split at the next paragraph/blank line
    if (currentPageText.length > 1200 && line.trim() === '') {
      result += currentPageText.trim() + '\n\n---\n\n';
      currentPageText = '';
    }
  }

  // Add the last page
  if (currentPageText.trim().length > 0) {
    result += currentPageText.trim() + '\n';
  }

  fs.writeFileSync(outputPath, result);
  console.log(`Successfully generated Marp Markdown: ${outputPath}`);
}

splitToMarp('clean_extracted.md', 'memoire_marp_vertical.md');
