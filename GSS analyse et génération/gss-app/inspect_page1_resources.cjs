const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream, PDFDict } = require('pdf-lib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const page = doc.getPage(0); // Page 1
    
    const resources = doc.context.lookup(page.node.get(PDFName.of('Resources')));
    const xobject = doc.context.lookup(resources.get(PDFName.of('XObject')));
    const x19 = doc.context.lookup(xobject.get(PDFName.of('X19')));
    
    const x19Resources = doc.context.lookup(x19.dict.get(PDFName.of('Resources')));
    const font = x19Resources.get(PDFName.of('Font'));
    if (font) {
        const fontDict = doc.context.lookup(font);
        console.log("Fonts on Page 1 / X19:");
        for (const key of fontDict.keys()) {
            const fontObj = doc.context.lookup(fontDict.get(key));
            const baseFont = fontObj.get(PDFName.of('BaseFont'));
            console.log(`  Key: ${key.toString()}, BaseFont: ${baseFont ? baseFont.toString() : 'undefined'}`);
        }
    } else {
        console.log("No fonts on Page 1 / X19 resources!");
    }
}

run().catch(console.error);
