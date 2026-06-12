const fs = require('fs');
const path = require('path');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

const zlib = require('zlib');
const { PDFDocument, PDFName, PDFStream, PDFArray } = require('pdf-lib');

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    
    // Page 1
    const p1 = doc.getPage(0);
    const contentsRef = p1.node.get(PDFName.of('Contents'));
    
    const contents = doc.context.lookup(contentsRef);
    
    const streams = [];
    if (contents instanceof PDFStream) {
        streams.push(contents);
    } else if (contents instanceof PDFArray) {
        for (let i = 0; i < contents.size(); i++) {
            const element = doc.context.lookup(contents.get(i));
            if (element instanceof PDFStream) streams.push(element);
        }
    }
    
    console.log("=== Page 1 Stream Colors ===");
    streams.forEach((stream, idx) => {
        try {
            const rawBytes = stream.contents;
            const decompressed = zlib.inflateSync(rawBytes);
            const text = decompressed.toString('utf-8');
            console.log(`Stream ${idx} decompressed length: ${text.length}`);
            console.log("--- Content ---");
            console.log(text);
            console.log("---------------");
        } catch (err) {
            console.error(`Error decompressing stream ${idx}:`, err);
        }
    });
}

run().catch(console.error);
