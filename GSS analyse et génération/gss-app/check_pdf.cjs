const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

const parser = new PDFParse({ data: dataBuffer });

parser.getText({
    first: 10 // Let's check the first 10 pages first
}).then(function(data) {
    console.log("Total Pages:", data.total);
    console.log("Extracted text snippet length:", data.text.length);
    console.log("--- First 1000 characters of text ---");
    console.log(data.text.substring(0, 1000).replace(/\n+/g, '\n'));
    parser.destroy();
}).catch(err => {
    console.error("Error parsing PDF:", err);
});
