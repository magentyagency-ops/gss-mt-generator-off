const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);
const parser = new PDFParse({ data: dataBuffer });

async function run() {
    console.log("Starting text extraction of 119 pages...");
    const textResult = await parser.getText();
    const totalPages = textResult.total;
    
    // The page-by-page extraction loop starts here
    const pageData = [];
    for (let p = 1; p <= totalPages; p++) {
        try {
            const result = await parser.getText({ partial: [p] });
            const pageText = result.text.trim();
            const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
            const title = lines[0] || `Page ${p}`;
            pageData.push({
                pageNumber: p,
                title: title,
                text: pageText,
                snippet: pageText.substring(0, 200)
            });
            if (p % 20 === 0) {
                console.log(`Parsed ${p}/${totalPages} pages...`);
            }
        } catch (err) {
            console.error(`Error on page ${p}:`, err.message);
        }
    }
    
    fs.writeFileSync('../Template/Mémoire technique/slides_text.json', JSON.stringify(pageData, null, 2), 'utf8');
    console.log("Finished! JSON saved at ../Template/Mémoire technique/slides_text.json. Total pages parsed:", pageData.length);
    await parser.destroy();
}

run().catch(console.error);
