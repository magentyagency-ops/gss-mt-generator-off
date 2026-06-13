import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const pdfPath = path.resolve('../Template/Mémoire technique/AO RNE.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

pdfParse(dataBuffer, {
    max: 10 // Let's check the first 10 pages first
}).then(function(data) {
    console.log("Total Pages:", data.numpages);
    console.log("Extracted text snippet length:", data.text.length);
    console.log("--- First 1000 characters of text ---");
    console.log(data.text.substring(0, 1000));
}).catch(err => {
    console.error("Error parsing PDF:", err);
});
