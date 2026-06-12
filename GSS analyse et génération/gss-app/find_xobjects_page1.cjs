const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFDict, PDFStream } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const p1 = doc.getPage(0);
    
    console.log("=== RECURSIVE XOBJECT LOOKUP ===");
    
    // Resolve Resources dictionary
    let resources = p1.node.get(PDFName.of('Resources'));
    if (!resources) {
        // Check parent
        let parent = p1.node.get(PDFName.of('Parent'));
        while (parent) {
            const parentDict = doc.context.lookup(parent);
            resources = parentDict.get(PDFName.of('Resources'));
            if (resources) break;
            parent = parentDict.get(PDFName.of('Parent'));
        }
    }
    
    if (!resources) {
        console.log("No Resources found!");
        return;
    }
    
    const resDict = doc.context.lookup(resources);
    const resKeys = resDict.keys().map(k => k.toString());
    console.log("Resources keys found:", resKeys);
    
    const xobject = resDict.get(PDFName.of('XObject'));
    if (!xobject) {
        console.log("No XObjects in Resources!");
        return;
    }
    
    const xObjectDict = doc.context.lookup(xobject);
    const xObjectKeys = xObjectDict.keys().map(k => k.toString());
    console.log("XObject keys found:", xObjectKeys);
    
    for (const key of xObjectDict.keys()) {
        const obj = doc.context.lookup(xObjectDict.get(key));
        const keyStr = key.toString();
        console.log(`\nXObject ${keyStr}:`);
        console.log("  Type:", obj.constructor.name);
        if (obj instanceof PDFStream) {
            const subtype = obj.dict.get(PDFName.of('Subtype'));
            console.log("  Subtype:", subtype ? subtype.toString() : "none");
            
            // If it's a Form XObject, it has a content stream
            try {
                const rawBytes = obj.contents;
                let text = "";
                try {
                    const decompressed = zlib.inflateSync(rawBytes);
                    text = decompressed.toString('utf-8');
                } catch (e) {
                    text = rawBytes.toString('utf-8');
                }
                console.log(`  Stream Length: ${text.length}`);
                if (text.includes("ROUEN") || text.includes("SECURITE") || text.includes("GLOBAL")) {
                    console.log("  -> MATCH FOUND IN STREAM!");
                    console.log("  Snippet (first 1000 chars):");
                    console.log(text.substring(0, 1000));
                } else {
                    console.log("  No match in stream snippet:", text.substring(0, 150).replace(/\n+/g, ' '));
                }
            } catch (err) {
                console.error("  Error reading stream:", err.message);
            }
        }
    }
}

run().catch(console.error);
