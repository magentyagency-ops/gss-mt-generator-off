const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream, PDFDict } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    console.log("Loading PDF...");
    const doc = await PDFDocument.load(dataBuffer);
    const p1 = doc.getPage(0);
    
    const resources = doc.context.lookup(p1.node.get(PDFName.of('Resources')));
    const xobject = doc.context.lookup(resources.get(PDFName.of('XObject')));
    const x19 = doc.context.lookup(xobject.get(PDFName.of('X19')));
    
    if (x19 instanceof PDFStream) {
        const rawBytes = x19.contents;
        const decompressed = zlib.inflateSync(rawBytes);
        let text = decompressed.toString('utf-8');
        
        console.log("Checking if /X17 Do exists in X19...");
        if (text.includes('/X17 Do')) {
            console.log("Found /X17 Do! Removing it...");
            text = text.replace('/X17 Do', '       '); // Replace with 7 spaces
            
            const recompressed = zlib.deflateSync(Buffer.from(text, 'utf-8'));
            x19.contents = recompressed;
            console.log("Successfully set updated content!");
        } else {
            console.log("Could not find /X17 Do in X19 content!");
        }
    } else {
        console.error("X19 is not a stream!");
    }
    
    // Save output to test folder
    const outputPath = path.resolve('../Reponse/Test_Cover_Cleaned.pdf');
    const pdfBytes = await doc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(`Saved test PDF to ${outputPath}`);
}

run().catch(console.error);
