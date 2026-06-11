const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);
const parser = new PDFParse({ data: dataBuffer });

async function run() {
    // Load document
    const doc = await parser.load();
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    
    console.log("Viewport dimensions: Width =", viewport.width, "Height =", viewport.height);
    console.log("--- Text Items on Page 1 ---");
    for (const item of content.items) {
        if (!("str"in item)) continue;
        const tx = item.transform; // [a, b, c, d, e, f] -> e = x, f = y in PDF points
        // Convert to viewport coordinates
        const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);
        console.log(`Text: "${item.str}" | PDF coords: x=${tx[4].toFixed(2)}, y=${tx[5].toFixed(2)} | Viewport coords: x=${x.toFixed(2)}, y=${y.toFixed(2)} | Width: ${item.width.toFixed(2)}`);
    }
    await parser.destroy();
}

run().catch(console.error);
