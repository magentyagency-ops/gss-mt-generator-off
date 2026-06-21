const mammoth = require("mammoth");
const fs = require("fs");

const options = {
    convertImage: mammoth.images.imgElement(function(image) {
        return {
            src: "" // Ignore images
        };
    })
};

mammoth.convertToMarkdown({path: "Mémoire technique GSS_1781976509071.docx"}, options)
    .then(function(result){
        // Remove empty images ![]( ) or similar patterns if any
        let md = result.value.replace(/!\[\]\(data:image\/[^)]+\)/g, '');
        md = md.replace(/!\[\]\(\)/g, '');
        fs.writeFileSync("clean_extracted.md", md);
        console.log("Clean Markdown length without images:", md.length);
    }).catch(console.error);
