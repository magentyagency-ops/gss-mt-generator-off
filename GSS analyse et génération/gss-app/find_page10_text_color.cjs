const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream, PDFDict } = require('pdf-lib');
const zlib = require('zlib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const page = doc.getPage(9); // Page 10
    
    function searchObj(obj, name) {
        if (!obj) return;
        const resolved = doc.context.lookup(obj);
        if (resolved instanceof PDFStream) {
            try {
                const rawBytes = resolved.contents;
                const decompressed = zlib.inflateSync(rawBytes);
                const text = decompressed.toString('utf-8');
                if (text.includes("PRESENTATION") || text.includes("VALEURS")) {
                    console.log(`Found match in Stream! Length: ${text.length}`);
                    console.log("=== Content ===");
                    const lines = text.split('\n');
                    let activeColor = "";
                    lines.forEach((line, idx) => {
                        if (line.includes('rg') || line.includes('RG') || line.includes('g') || line.includes('G')) {
                            activeColor = line;
                        }
                        if (line.includes('Tj') || line.includes('TJ')) {
                            console.log(`Line ${idx}: ${line} | Active Color: ${activeColor}`);
                        }
                    });
                }
            } catch (e) {}
            
            const resources = resolved.dict.get(PDFName.of('Resources'));
            if (resources) searchObj(resources, name);
        } else if (resolved instanceof PDFDict) {
            const xobject = resolved.get(PDFName.of('XObject'));
            if (xobject) {
                const xobjectDict = doc.context.lookup(xobject);
                for (const key of xobjectDict.keys()) {
                    searchObj(xobjectDict.get(key), key.toString());
                }
            }
            const font = resolved.get(PDFName.of('Font'));
            // also look at resources fonts if needed
        }
    }
    
    // Look at page contents
    const contentsRef = page.node.get(PDFName.of('Contents'));
    if (contentsRef) {
        const contents = doc.context.lookup(contentsRef);
        if (contents instanceof PDFStream) {
            searchObj(contentsRef, "PageContent");
        } else if (contents instanceof Array || contents.array) {
            const arr = contents.array || contents;
            for (let i = 0; i < arr.length; i++) {
                searchObj(arr[i], `PageContent[${i}]`);
            }
        }
    }
    
    // Look at page resources
    const resources = page.node.get(PDFName.of('Resources'));
    if (resources) searchObj(resources, "PageResources");
}

run().catch(console.error);
