const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream, PDFArray } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const page = doc.getPage(22); // Page 23
    
    const contentsRef = page.node.get(PDFName.of('Contents'));
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
    
    console.log("=== Page 23 Content Streams ===");
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
