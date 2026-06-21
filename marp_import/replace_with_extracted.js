const fs = require('fs');
const path = require('path');

const extractedDir = path.join(process.cwd(), 'extracted_images_from_pdf');
const targetAssetsDir = path.join(process.cwd(), 'assets', 'extracted_images');
const markdownFile = path.join(process.cwd(), 'memoire_marp_vertical_enriched.md');

// Create target directory
if (!fs.existsSync(targetAssetsDir)) {
    fs.mkdirSync(targetAssetsDir, { recursive: true });
}

// Read extracted images
const files = fs.readdirSync(extractedDir).filter(f => f.startsWith('extracted_image_'));

// Sort files by page_index then img_index
files.sort((a, b) => {
    // format: extracted_image_12_1.jpeg
    const matchA = a.match(/extracted_image_(\d+)_(\d+)\./);
    const matchB = b.match(/extracted_image_(\d+)_(\d+)\./);
    
    if (!matchA || !matchB) return 0;
    
    const pageA = parseInt(matchA[1], 10);
    const pageB = parseInt(matchB[1], 10);
    
    if (pageA !== pageB) {
        return pageA - pageB;
    }
    
    const imgA = parseInt(matchA[2], 10);
    const imgB = parseInt(matchB[2], 10);
    return imgA - imgB;
});

// Copy files to assets
files.forEach(file => {
    fs.copyFileSync(path.join(extractedDir, file), path.join(targetAssetsDir, file));
});

// Read markdown
let markdownContent = fs.readFileSync(markdownFile, 'utf8');

// Count how many illustration tags we have
const regex = /!\[class:illustration-(right|center)\]\([^)]+\)/g;
const matches = markdownContent.match(regex);
const totalTags = matches ? matches.length : 0;

console.log(`Found ${totalTags} illustration tags in markdown.`);
console.log(`Found ${files.length} extracted images.`);

if (totalTags === 0) {
    console.log('No tags to replace.');
    process.exit(0);
}

// Distribute images evenly if there are more images than tags,
// or just use them sequentially if there are fewer images than tags.
let usedImages = [];
if (files.length >= totalTags) {
    // evenly space out the images
    const step = files.length / totalTags;
    for (let i = 0; i < totalTags; i++) {
        const imgIndex = Math.floor(i * step);
        usedImages.push(files[imgIndex]);
    }
} else {
    // Use them sequentially, loop if necessary
    for (let i = 0; i < totalTags; i++) {
        usedImages.push(files[i % files.length]);
    }
}

// Replace in markdown
let currentTagIndex = 0;
markdownContent = markdownContent.replace(regex, (match, p1) => {
    const imgFile = usedImages[currentTagIndex];
    currentTagIndex++;
    return `![class:illustration-${p1}](assets/extracted_images/${imgFile})`;
});

fs.writeFileSync(markdownFile, markdownContent, 'utf8');
console.log('Markdown successfully updated with original extracted images!');
