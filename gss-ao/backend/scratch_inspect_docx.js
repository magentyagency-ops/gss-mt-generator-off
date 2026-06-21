const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const zip = new AdmZip('AO RNE.docx');
const docXml = zip.readAsText('word/document.xml');
const relsXml = zip.readAsText('word/_rels/document.xml.rels');

// Find the relationship ID for talkie walkie or just any image near "TALKIES WALKIES"
const talkieMatch = docXml.indexOf('TALKIES WALKIES');
if (talkieMatch !== -1) {
    const surroundingXml = docXml.substring(talkieMatch - 1000, talkieMatch + 2000);
    console.log("Surrounding XML near TALKIES WALKIES:");
    // Try to find the closest <w:drawing>
    const drawings = surroundingXml.match(/<w:drawing>.*?<\/w:drawing>/g);
    if (drawings) {
        console.log("Found drawing:");
        console.log(drawings[0]);
    } else {
        console.log("No drawing found nearby.");
    }
}
