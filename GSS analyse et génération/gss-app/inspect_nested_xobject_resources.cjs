const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream } = require('pdf-lib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const p1 = doc.getPage(0);
    
    const resources = doc.context.lookup(p1.node.get(PDFName.of('Resources')));
    const xobject = doc.context.lookup(resources.get(PDFName.of('XObject')));
    const x19 = doc.context.lookup(xobject.get(PDFName.of('X19')));
    
    const x19Resources = doc.context.lookup(x19.dict.get(PDFName.of('Resources')));
    const x19XObject = doc.context.lookup(x19Resources.get(PDFName.of('XObject')));
    
    for (const key of ['/X17', '/X18', '/X14', '/X15']) {
        const obj = doc.context.lookup(x19XObject.get(PDFName.of(key.slice(1))));
        if (obj instanceof PDFStream) {
            const nestedRes = obj.dict.get(PDFName.of('Resources'));
            if (nestedRes) {
                const resDict = doc.context.lookup(nestedRes);
                console.log(`\n=== Resources of ${key} ===`);
                console.log("Keys:", resDict.keys().map(k => k.toString()));
                const font = resDict.get(PDFName.of('Font'));
                if (font) {
                    const fontDict = doc.context.lookup(font);
                    for (const fKey of fontDict.keys()) {
                        const fontObj = doc.context.lookup(fontDict.get(fKey));
                        const baseFont = fontObj.get(PDFName.of('BaseFont'));
                        console.log(`  Font Key: ${fKey.toString()}, BaseFont: ${baseFont ? baseFont.toString() : 'undefined'}`);
                    }
                }
            } else {
                console.log(`No resources on ${key}!`);
            }
        }
    }
}

run().catch(console.error);
