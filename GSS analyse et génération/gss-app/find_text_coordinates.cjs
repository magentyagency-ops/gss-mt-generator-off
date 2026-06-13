const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);
const parser = new PDFParse({ data: dataBuffer });

const targetPages = [1, 23, 24, 28, 30, 103, 104, 105];
const keywords = [/rouen/i, /expositions/i, /rne/i];

async function run() {
    const doc = await parser.load();
    console.log("Analyzing coordinates of target pages...");
    
    for (const pageNum of targetPages) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        
        console.log(`\n================ Page ${pageNum} (Viewport: ${viewport.width.toFixed(2)}x${viewport.height.toFixed(2)}) ================`);
        
        for (const item of content.items) {
            if (!item.str || item.str.trim() === '') continue;
            const matches = keywords.some(kw => kw.test(item.str));
            if (matches) {
                const tx = item.transform; // [a, b, c, d, e, f]
                const x = tx[4];
                const y = tx[5];
                console.log(`Text: "${item.str}"`);
                console.log(`  PDF Coords: x=${x.toFixed(2)}, y=${y.toFixed(2)}, width=${item.width.toFixed(2)}, height=${item.height.toFixed(2)}`);
                console.log(`  Font: ${item.fontName}`);
            }
        }
    }
    await parser.destroy();
}

run().catch(console.error);
