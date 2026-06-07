const fs = require('fs');
const path = require('path');

const slidesJsonPath = path.resolve('../Template/Mémoire technique/slides_text.json');
const slides = JSON.parse(fs.readFileSync(slidesJsonPath, 'utf8'));

console.log("--- SEARCHING FOR PROJECT STRUCTURE SLIDES ---");
slides.forEach(slide => {
    const textLower = slide.text.toLowerCase();
    if (textLower.includes('parc') || textLower.includes('exposition')) {
        console.log(`Page ${slide.pageNumber}: Title "${slide.title}"`);
        console.log(slide.text);
        console.log("----------------------------------------------");
    }
});
