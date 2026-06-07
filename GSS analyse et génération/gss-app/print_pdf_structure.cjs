const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName } = require('pdf-lib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const p1 = doc.getPage(0);
    
    console.log("=== PAGE 1 DICTIONARY KEYS ===");
    p1.node.keys().forEach(key => {
        console.log(`Key: ${key.toString()} | Type: ${p1.node.get(key).constructor.name}`);
    });
    
    let parentRef = p1.node.get(PDFName.of('Parent'));
    if (parentRef) {
        console.log("\n=== PARENT DICTIONARY KEYS ===");
        const parent = doc.context.lookup(parentRef);
        parent.keys().forEach(key => {
            console.log(`Key: ${key.toString()} | Type: ${parent.get(key).constructor.name}`);
        });
        
        let grandParentRef = parent.get(PDFName.of('Parent'));
        if (grandParentRef) {
            console.log("\n=== GRANDPARENT DICTIONARY KEYS ===");
            const grandParent = doc.context.lookup(grandParentRef);
            grandParent.keys().forEach(key => {
                console.log(`Key: ${key.toString()} | Type: ${grandParent.get(key).constructor.name}`);
            });
        }
    }
}

run().catch(console.error);
