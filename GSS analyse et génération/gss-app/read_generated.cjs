const fs = require('fs');
const mammoth = require('mammoth');

const filePath = "../Reponse/Memoire_Technique_Université_de_Rouen_Normandie_31-05-2026.docx";

mammoth.extractRawText({ path: filePath })
  .then(function(result) {
    const text = result.value;
    fs.writeFileSync("../generated_text_extracted.txt", text, 'utf8');
    console.log("Extraction complete. Text length:", text.length);
  })
  .catch(function(err) {
    console.error(err);
  });
