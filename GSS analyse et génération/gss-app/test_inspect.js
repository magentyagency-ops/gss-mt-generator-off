import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const xmlPath = path.join(__dirname, 'document_xml_inspect.xml');
const docXml = fs.readFileSync(xmlPath, 'utf8');

// A helper to strip XML tags from a snippet to see the plain text
function cleanText(xmlSnippet) {
  return xmlSnippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Find all w:ffData or w:checkBox occurrences
const regex = /<w:ffData>([\s\S]*?)<\/w:ffData>/g;
let match;
let count = 0;

console.log('--- DETAILED CHECKBOX MAPPING ---');
while ((match = regex.exec(docXml)) !== null) {
  count++;
  const ffContent = match[0];
  
  // Get text before and after the match
  const startIdx = match.index;
  const xmlBefore = docXml.substring(Math.max(0, startIdx - 150), startIdx);
  const xmlAfter = docXml.substring(startIdx + ffContent.length, Math.min(docXml.length, startIdx + ffContent.length + 300));
  
  const textBefore = cleanText(xmlBefore);
  const textAfter = cleanText(xmlAfter);
  
  console.log(`Checkbox #${count} (index: ${startIdx}):`);
  console.log(`  [TEXT BEFORE]: "${textBefore}"`);
  console.log(`  [TEXT AFTER]:  "${textAfter}"`);
}
