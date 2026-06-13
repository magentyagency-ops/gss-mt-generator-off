const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const p1 = doc.getPage(0);
    
    const resources = doc.context.lookup(p1.node.get(PDFName.of('Resources')));
    const xobject = doc.context.lookup(resources.get(PDFName.of('XObject')));
    const x19 = doc.context.lookup(xobject.get(PDFName.of('X19')));
    
    // x19 is a PDFRawStream, its dictionary is x19.dict
    const x19Resources = doc.context.lookup(x19.dict.get(PDFName.of('Resources')));
    if (!x19Resources) {
        console.log("No resources on X19!");
        return;
    }
    
    console.log("X19 Resources keys:", x19Resources.keys().map(k => k.toString()));
    
    const x19XObject = doc.context.lookup(x19Resources.get(PDFName.of('XObject')));
    if (!x19XObject) {
        console.log("No XObject entry in X19 Resources!");
        return;
    }
    
    const keys = x19XObject.keys().map(k => k.toString());
    console.log("Nested XObject keys in X19:", keys);
    
    for (const key of x19XObject.keys()) {
        const keyStr = key.toString();
        const obj = doc.context.lookup(x19XObject.get(key));
        if (obj instanceof PDFStream) {
            const subtype = obj.dict.get(PDFName.of('Subtype'));
            console.log(`\nNested XObject ${keyStr} (Subtype: ${subtype ? subtype.toString() : "none"}):`);
            try {
                const rawBytes = obj.contents;
                let text = "";
                try {
                    const decompressed = zlib.inflateSync(rawBytes);
                    text = decompressed.toString('utf-8');
                } catch (e) {
                    text = rawBytes.toString('utf-8');
                }
                
                console.log(`  Decompressed Length: ${text.length}`);
                if (text.includes("ROUEN") || text.includes("SECURITE") || text.includes("GLOBAL") || text.includes("BT")) {
                    console.log("  -> MATCH / TEXT OPERATORS FOUND!");
                    console.log("  Snippet (first 500 chars):");
                    console.log(text.substring(0, 500));
                } else {
                    console.log("  No matches. Snippet:", text.substring(0, 100).replace(/\n+/g, ' '));
                }
            } catch (err) {
                console.error("  Error decompressing:", err.message);
            }
        }
    }
}

run().catch(console.error);
