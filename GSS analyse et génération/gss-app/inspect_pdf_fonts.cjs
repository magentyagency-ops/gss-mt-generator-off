const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName } = require('pdf-lib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const page = doc.getPage(22); // Page 23 is index 22
    
    let resources = page.node.get(PDFName.of('Resources'));
    if (!resources) {
        console.log("No Resources on Page 23!");
        return;
    }
    
    resources = doc.context.lookup(resources);
    const font = resources.get(PDFName.of('Font'));
    if (!font) {
        console.log("No Fonts on Page 23!");
        return;
    }
    
    const fontDict = doc.context.lookup(font);
    console.log("Fonts on Page 23:");
    for (const key of fontDict.keys()) {
        const fontObj = doc.context.lookup(fontDict.get(key));
        const baseFont = fontObj.get(PDFName.of('BaseFont'));
        const subtype = fontObj.get(PDFName.of('Subtype'));
        console.log(`Key: ${key.toString()}, BaseFont: ${baseFont ? baseFont.toString() : 'undefined'}, Subtype: ${subtype ? subtype.toString() : 'undefined'}`);
    }
}

run().catch(console.error);
