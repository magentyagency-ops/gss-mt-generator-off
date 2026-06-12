const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream, PDFArray, PDFRef } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const p1 = doc.getPage(0);
    
    console.log("=== SCANNING PAGE 1 STREAMS ===");
    
    // Look at p1.node.get(PDFName.of('Contents'))
    const contentsRef = p1.node.get(PDFName.of('Contents'));
    
    const resolveStream = (refOrObj) => {
        const obj = doc.context.lookup(refOrObj);
        if (obj instanceof PDFStream) {
            return [obj];
        } else if (obj instanceof PDFArray) {
            const arr = [];
            for (let i = 0; i < obj.size(); i++) {
                const inner = doc.context.lookup(obj.get(i));
                if (inner instanceof PDFStream) arr.push(inner);
            }
            return arr;
        }
        return [];
    };
    
    const streams = resolveStream(contentsRef);
    console.log(`Found ${streams.length} content streams.`);
    
    streams.forEach((stream, idx) => {
        try {
            const rawBytes = stream.contents;
            let text = "";
            try {
                const decompressed = zlib.inflateSync(rawBytes);
                text = decompressed.toString('utf-8');
            } catch (e) {
                // Try decoding as-is
                text = rawBytes.toString('utf-8');
            }
            
            console.log(`\nStream ${idx} (Length: ${text.length}):`);
            if (text.includes("ROUEN") || text.includes("SECURITE") || text.includes("GLOBAL")) {
                console.log("-> MATCH FOUND!");
                console.log(text.substring(0, 1000));
            } else {
                console.log("No match in first 100 chars:", text.substring(0, 100).replace(/\n+/g, ' '));
            }
        } catch (err) {
            console.error(`Error processing stream ${idx}:`, err.message);
        }
    });
}

run().catch(console.error);
