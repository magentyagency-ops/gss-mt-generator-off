const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFStream } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    console.log("Scanning all PDF objects in the context...");
    
    let matchCount = 0;
    
    // doc.context.indirectObjects is a Map of PDFRef -> PDFObject
    for (const [ref, obj] of doc.context.indirectObjects.entries()) {
        if (obj instanceof PDFStream) {
            try {
                const rawBytes = obj.contents;
                let text = "";
                try {
                    const decompressed = zlib.inflateSync(rawBytes);
                    text = decompressed.toString('utf-8');
                } catch (e) {
                    text = rawBytes.toString('utf-8');
                }
                
                if (text.includes("ROUEN") || text.includes("SECURITE") || text.includes("expositions de rouen") || text.includes("EXPOSITIONS")) {
                    matchCount++;
                    console.log(`\n================ Match #${matchCount} (Ref: ${ref.toString()}) ================`);
                    console.log("Constructor:", obj.constructor.name);
                    if (obj.dict) {
                        const keys = obj.dict.keys().map(k => k.toString());
                        console.log("Dict Keys:", keys);
                        const subtype = obj.dict.get(require('pdf-lib').PDFName.of('Subtype'));
                        if (subtype) console.log("Subtype:", subtype.toString());
                    }
                    console.log("Decompressed stream length:", text.length);
                    console.log("--- Content Snippet ---");
                    console.log(text.substring(0, 1500));
                    console.log("-----------------------");
                }
            } catch (err) {
                // Ignore parsing/inflation errors
            }
        }
    }
    console.log(`\nScan complete. Found ${matchCount} matching streams.`);
}

run().catch(console.error);
