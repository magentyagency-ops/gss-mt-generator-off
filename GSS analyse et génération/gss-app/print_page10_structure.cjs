const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream, PDFDict } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const page = doc.getPage(9); // Page 10
    
    console.log("=== Page 10 Resources ===");
    let resources = page.node.get(PDFName.of('Resources'));
    if (!resources) {
        let parent = page.node.get(PDFName.of('Parent'));
        while (parent) {
            const parentDict = doc.context.lookup(parent);
            resources = parentDict.get(PDFName.of('Resources'));
            if (resources) break;
            parent = parentDict.get(PDFName.of('Parent'));
        }
    }
    
    if (resources) {
        const resDict = doc.context.lookup(resources);
        console.log("Resources keys:", resDict.keys().map(k => k.toString()));
        const xobject = resDict.get(PDFName.of('XObject'));
        if (xobject) {
            const xobjectDict = doc.context.lookup(xobject);
            console.log("XObjects:", xobjectDict.keys().map(k => k.toString()));
            
            for (const key of xobjectDict.keys()) {
                const keyStr = key.toString();
                const obj = doc.context.lookup(xobjectDict.get(key));
                if (obj instanceof PDFStream) {
                    const subtype = obj.dict.get(PDFName.of('Subtype'));
                    console.log(`  XObject ${keyStr} (Subtype: ${subtype ? subtype.toString() : 'none'})`);
                    try {
                        const rawBytes = obj.contents;
                        const decompressed = zlib.inflateSync(rawBytes);
                        const text = decompressed.toString('utf-8');
                        console.log(`    Decompressed Length: ${text.length}`);
                        // check if it has text operators
                        if (text.includes("BT") && text.includes("ET")) {
                            console.log(`    -> Contains BT/ET!`);
                            // Print first 300 chars
                            console.log("    Snippet:", text.substring(0, 300).replace(/\n+/g, ' '));
                        }
                    } catch (e) {}
                }
            }
        }
    }
    
    console.log("\n=== Page 10 Content Streams ===");
    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (contentsRef) {
        const contents = doc.context.lookup(contentsRef);
        const streams = contents instanceof PDFStream ? [contents] : contents.array || contents;
        for (let i = 0; i < streams.length; i++) {
            const stream = doc.context.lookup(streams[i]);
            if (stream instanceof PDFStream) {
                try {
                    const rawBytes = stream.contents;
                    const decompressed = zlib.inflateSync(rawBytes);
                    const text = decompressed.toString('utf-8');
                    console.log(`  Stream ${i} length: ${text.length}`);
                    console.log(`  Snippet:`, text.substring(0, 300).replace(/\n+/g, ' '));
                } catch (e) {}
            }
        }
    }
}

run().catch(console.error);
