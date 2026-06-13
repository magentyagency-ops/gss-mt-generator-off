const fs = require('fs');
const path = require('path');

const slidesJsonPath = path.resolve('../Template/Mémoire technique/slides_text.json');
if (!fs.existsSync(slidesJsonPath)) {
    console.error("File not found:", slidesJsonPath);
    process.exit(1);
}

const slides = JSON.parse(fs.readFileSync(slidesJsonPath, 'utf8'));

// Regexes with word boundaries to find references
const keywordRegexes = [
    /\brouen\b/i,
    /\brne\b/i,
    /\bparc\b/i,
    /\bexposition/i,
    /\binspe\b/i,
    /\bmont-saint-aignan\b/i,
    /\bmartainville\b/i,
    /\bpasteur\b/i,
    /\bmadrillet\b/i,
    /\bevreux\b/i,
    /\btilly-navarre\b/i
];

console.log("--- SCANNING FOR KEYWORDS (WHOLE WORDS) ---");
slides.forEach(slide => {
    const lines = slide.text.split('\n');
    let pagePrinted = false;
    lines.forEach((line, lineIndex) => {
        const matchingRegex = keywordRegexes.find(regex => regex.test(line));
        if (matchingRegex) {
            if (!pagePrinted) {
                console.log(`\n=================== Page ${slide.pageNumber}: Title "${slide.title}" ===================`);
                pagePrinted = true;
            }
            console.log(`Line ${lineIndex + 1}: "${line.trim()}" (matched ${matchingRegex})`);
        }
    });
});

