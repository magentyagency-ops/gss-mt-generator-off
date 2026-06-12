const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFStream, PDFDict } = require('pdf-lib');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

async function run() {
    const doc = await PDFDocument.load(dataBuffer);
    const page = doc.getPage(22); // Page 23 is index 22
    
    function inspectResources(resObj, prefix = "") {
        if (!resObj) return;
        const res = doc.context.lookup(resObj);
        if (!(res instanceof PDFDict)) return;
        
        console.log(`${prefix}Resources keys:`, res.keys().map(k => k.toString()));
        
        const font = res.get(PDFName.of('Font'));
        if (font) {
            const fontDict = doc.context.lookup(font);
            console.log(`${prefix}Fonts:`);
            for (const key of fontDict.keys()) {
                const fontObj = doc.context.lookup(fontDict.get(key));
                const baseFont = fontObj.get(PDFName.of('BaseFont'));
                console.log(`${prefix}  Key: ${key.toString()}, BaseFont: ${baseFont ? baseFont.toString() : 'undefined'}`);
            }
        }
        
        const xobject = res.get(PDFName.of('XObject'));
        if (xobject) {
            const xobjectDict = doc.context.lookup(xobject);
            for (const key of xobjectDict.keys()) {
                const xobj = doc.context.lookup(xobjectDict.get(key));
                if (xobj instanceof PDFStream) {
                    const subtype = xobj.dict.get(PDFName.of('Subtype'));
                    console.log(`${prefix}XObject ${key.toString()} (Subtype: ${subtype ? subtype.toString() : 'none'})`);
                    const nestedRes = xobj.dict.get(PDFName.of('Resources'));
                    if (nestedRes) {
                        inspectResources(nestedRes, prefix + "  ");
                    }
                }
            }
        }
    }
    
    let resources = page.node.get(PDFName.of('Resources'));
    if (!resources) {
        // Check Parent
        let parent = page.node.get(PDFName.of('Parent'));
        while (parent) {
            const parentDict = doc.context.lookup(parent);
            resources = parentDict.get(PDFName.of('Resources'));
            if (resources) break;
            parent = parentDict.get(PDFName.of('Parent'));
        }
    }
    
    console.log("=== Page 23 Resources ===");
    inspectResources(resources);
}

run().catch(console.error);
