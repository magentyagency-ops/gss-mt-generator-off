const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const page = doc.getPage(22); // Page 23
    
    const resources = doc.context.lookup(page.node.get(PDFName.of('Resources')));
    const xobject = doc.context.lookup(resources.get(PDFName.of('XObject')));
    const x19 = doc.context.lookup(xobject.get(PDFName.of('X19')));
    
    const rawBytes = x19.contents;
    let text = "";
    try {
        const decompressed = zlib.inflateSync(rawBytes);
        text = decompressed.toString('utf-8');
    } catch (e) {
        text = rawBytes.toString('utf-8');
    }
    
    console.log("=== Page 23 X19 CONTENT ===");
    console.log(text);
    console.log("===========================");
}

run().catch(console.error);
