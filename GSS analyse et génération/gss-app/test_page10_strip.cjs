const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

// Function to strip BT...ET blocks
function stripTextBlocks(content) {
    let result = '';
    let pos = 0;
    while (true) {
        const btIdx = content.indexOf('BT', pos);
        if (btIdx === -1) {
            result += content.substring(pos);
            break;
        }
        
        // Add everything before BT
        result += content.substring(pos, btIdx);
        
        // Find matching ET
        const etIdx = content.indexOf('ET', btIdx);
        if (etIdx === -1) {
            // Unclosed BT, just skip it or stop
            break;
        }
        
        // Skip BT...ET block
        pos = etIdx + 2;
    }
    return result;
}

async function run() {
    console.log("Loading PDF...");
    const doc = await PDFDocument.load(dataBuffer);
    const page = doc.getPage(9); // Page 10
    
    const resources = doc.context.lookup(page.node.get(PDFName.of('Resources')));
    const xobject = doc.context.lookup(resources.get(PDFName.of('XObject')));
    const x13 = doc.context.lookup(xobject.get(PDFName.of('X13')));
    
    if (x13 instanceof PDFStream) {
        const rawBytes = x13.contents;
        const decompressed = zlib.inflateSync(rawBytes);
        const text = decompressed.toString('utf-8');
        
        console.log("Original text contains BT/ET. Stripping text blocks...");
        const strippedText = stripTextBlocks(text);
        console.log(`Length before: ${text.length}, after: ${strippedText.length}`);
        
        x13.contents = zlib.deflateSync(Buffer.from(strippedText, 'utf-8'));
        console.log("Set updated contents for X13!");
    } else {
        console.error("X13 is not a stream!");
    }
    
    const outputPath = path.resolve('../Reponse/Test_Page10_Stripped.pdf');
    const pdfBytes = await doc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    console.log(`Saved test PDF to ${outputPath}`);
}

run().catch(console.error);
