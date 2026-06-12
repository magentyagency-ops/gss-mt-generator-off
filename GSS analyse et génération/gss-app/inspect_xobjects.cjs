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
    
    const x19Resources = doc.context.lookup(x19.dict.get(PDFName.of('Resources')));
    const x19XObject = doc.context.lookup(x19Resources.get(PDFName.of('XObject')));
    
    for (const key of x19XObject.keys()) {
        const keyStr = key.toString();
        const obj = doc.context.lookup(x19XObject.get(key));
        if (obj instanceof PDFStream) {
            const subtype = obj.dict.get(PDFName.of('Subtype'));
            if (subtype && subtype.toString() === '/Form') {
                const rawBytes = obj.contents;
                let text = "";
                try {
                    const decompressed = zlib.inflateSync(rawBytes);
                    text = decompressed.toString('utf-8');
                } catch (e) {
                    text = rawBytes.toString('utf-8');
                }
                
                console.log(`\n=================== Nested XObject ${keyStr} ===================`);
                console.log(text);
            }
        }
    }
}

run().catch(console.error);
