const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const pdfPath = path.resolve('../Reponse/Test_MT_Paris_Saclay.pdf');
if (!fs.existsSync(pdfPath)) {
    console.error("Generated PDF not found:", pdfPath);
    process.exit(1);
}

const dataBuffer = fs.readFileSync(pdfPath);
const parser = new PDFParse({ data: dataBuffer });

async function run() {
    console.log("Analyzing generated PDF...");
    const textResult = await parser.getText();
    const totalPages = textResult.total;
    console.log("Total pages in generated PDF:", totalPages);
    
    for (let p = 1; p <= 7; p++) {
        if (p === 1 || p >= 5) {
            const pageResult = await parser.getText({ partial: [p] });
            console.log(`\n=================== Page ${p} ===================`);
            console.log(pageResult.text.trim());
        }
    }
    
    await parser.destroy();
}

run().catch(console.error);
