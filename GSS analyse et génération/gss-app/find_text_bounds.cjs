const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

async function run() {
    const doc = await pdfjsLib.getDocument('C:/Users/linal/Downloads/GSS analyse et génération/Reponse/Test_MT_Paris_Saclay.pdf').promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    
    console.log(`Page 10 dimensions: Width = ${viewport.width}, Height = ${viewport.height}`);
    console.log("--- All Text Items on Page 10 ---");
    for (const item of content.items) {
        if (!item.str || item.str.trim() === '') continue;
        const tx = item.transform; // [a, b, c, d, e, f]
        console.log(`Text: "${item.str}" | x=${tx[4].toFixed(2)}, y=${tx[5].toFixed(2)} | width=${item.width.toFixed(2)}, height=${item.height.toFixed(2)}`);
    }
    await parser.destroy();
}

run().catch(console.error);
