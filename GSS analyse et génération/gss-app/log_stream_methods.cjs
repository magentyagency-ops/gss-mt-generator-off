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
    
    console.log("x19 constructor name:", x19.constructor.name);
    console.log("x19 properties:", Object.keys(x19));
    console.log("x19 prototype methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(x19)));
}

run().catch(console.error);
