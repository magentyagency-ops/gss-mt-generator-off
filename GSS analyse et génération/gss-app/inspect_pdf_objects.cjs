const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    
    // Page 1
    const p1 = doc.getPage(0);
    const p1Resources = p1.node.Resources();
    console.log("=== Page 1 Resources ===");
    console.log("XObject keys:", p1Resources ? Object.keys(p1Resources.get('XObject') || {}) : "none");
    console.log("ColorSpace keys:", p1Resources ? Object.keys(p1Resources.get('ColorSpace') || {}) : "none");
    console.log("Shading keys:", p1Resources ? Object.keys(p1Resources.get('Shading') || {}) : "none");
    
    // Page 10
    const p10 = doc.getPage(9);
    const p10Resources = p10.node.Resources();
    console.log("\n=== Page 10 Resources ===");
    console.log("XObject keys:", p10Resources ? Object.keys(p10Resources.get('XObject') || {}) : "none");
    console.log("ColorSpace keys:", p10Resources ? Object.keys(p10Resources.get('ColorSpace') || {}) : "none");
    console.log("Shading keys:", p10Resources ? Object.keys(p10Resources.get('Shading') || {}) : "none");
}

run().catch(console.error);
