const mammoth = require("mammoth");
const fs = require("fs");

mammoth.extractRawText({path: "Mémoire technique GSS_1781976509071.docx"})
    .then(function(result){
        const text = result.value; // The raw text
        fs.writeFileSync("extracted_raw.txt", text);
        console.log("Extracted text length:", text.length);
    })
    .done();
