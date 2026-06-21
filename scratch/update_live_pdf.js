const http = require('http');
const fs = require('fs');
const path = require('path');

function post(url, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const dossierId = 'dossier-1782000361241';
  console.log(`Triggering generation for NEOMA (${dossierId})...`);
  
  const pollInterval = setInterval(async () => {
    try {
      const prog = await get(`http://localhost:8000/api/dossiers/${dossierId}/progress`);
      console.log(`[Progress] Status: ${prog.status} | ${prog.progress}% | ${prog.message}`);
    } catch (e) {
      console.error('Error polling:', e.message);
    }
  }, 2000);

  try {
    const result = await post(`http://localhost:8000/api/dce/${dossierId}/memoire`, {});
    console.log('Generation finished! Result:', result);
    
    if (result && result.file_path) {
      const targetPath = '/Users/clarencegomis/memoiretechnique/GSS-new/live_edit/Mémoire_Technique_GSS_Template_1782000541623.pdf';
      fs.copyFileSync(result.file_path, targetPath);
      console.log(`Successfully updated live PDF at: ${targetPath}`);
    } else {
      console.error('No file path returned in result');
    }
  } catch (e) {
    console.error('Generation failed:', e);
  } finally {
    clearInterval(pollInterval);
  }
}

run();
