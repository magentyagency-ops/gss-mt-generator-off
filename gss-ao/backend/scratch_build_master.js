const fs = require('fs');
const path = require('path');

const inputMd = fs.readFileSync('scratch_ao_rne.md', 'utf-8');
const outputMdPath = '/Users/clarencegomis/memoiretechnique/GSS-new/gss-ao/backend/src/generation/marp/gss_memoire_master.md';

const lines = inputMd.split('\n');
let slides = [];
let currentSlide = [];
let currentHeader = '';

// Default frontmatter for Marp
const frontmatter = `---
marp: true
theme: gss
size: a4
paginate: true
header: 'GLOBAL SECURITY SERVICES'
---

<!-- _class: lead -->

# GLOBAL SECURITY SERVICES
## VOTRE PARTENAIRE SÉCURITÉ
### MÉMOIRE TECHNIQUE
#### <entreprise>
`;

slides.push(frontmatter);

for (let i = 0; i < lines.length; i++) {
  let line = lines[i].trim();
  
  // Detect headings (we treat #, ##, ### as potential new slides)
  if (line.match(/^#{1,3}\s+(.*)/)) {
    const match = line.match(/^#{1,3}\s+(.*)/);
    let title = match[1].replace(/\*/g, '').trim();
    
    // Sometimes headings have numbers like "1. ", "II. ", let's keep them in the title
    if (currentSlide.length > 0 && currentSlide.some(l => l.trim().length > 0)) {
      // push previous slide
      let slideText = `---
<!-- header: "${currentHeader}" -->

${currentSlide.join('\n')}
`;
      slides.push(slideText);
    }
    
    currentSlide = [];
    currentHeader = title.toUpperCase();
    
    // Add intercalaire if it's a main chapter (starts with roman numeral like I. or II.)
    if (title.match(/^[IVX]+\.\s/)) {
      slides.push(`---
<!-- _class: intercalaire -->
<!-- _header: "" -->

# ${currentHeader}
`);
    }
  } else {
    // Normal text line
    if (line || currentSlide.length > 0) {
      currentSlide.push(line);
    }
  }
}

if (currentSlide.length > 0 && currentSlide.some(l => l.trim().length > 0)) {
  slides.push(`---
<!-- header: "${currentHeader}" -->

${currentSlide.join('\n')}
`);
}

fs.writeFileSync(outputMdPath, slides.join('\n'), 'utf-8');
console.log(`Generated new master template with ${slides.length} slides.`);
