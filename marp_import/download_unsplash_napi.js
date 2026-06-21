const fs = require('fs');
const path = require('path');
const https = require('https');

const destDir = path.join(__dirname, 'assets', 'images');
const catalogPath = path.join(__dirname, 'assets', 'catalog.json');

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const queries = [
  { term: 'security guard', limit: 8, label: 'security_guard' },
  { term: 'cctv camera', limit: 8, label: 'cctv' },
  { term: 'fire protection', limit: 8, label: 'fire_safety' },
  { term: 'server room', limit: 8, label: 'datacenter' },
  { term: 'handshake business', limit: 8, label: 'handshake' },
  { term: 'crowd control security', limit: 8, label: 'crowd' },
  { term: 'patrol car', limit: 4, label: 'patrol' }
];

const { execSync } = require('child_process');

function fetchJson(url) {
  try {
    const stdout = execSync(`curl -s "${url}"`, { maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(stdout.toString());
  } catch (e) {
    throw e;
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Handle redirect
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function start() {
  const imagesList = [];
  console.log('Searching Unsplash for relevant photos...');

  for (const q of queries) {
    const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(q.term)}&per_page=${q.limit}`;
    try {
      const data = await fetchJson(url);
      if (data && data.results) {
        let count = 0;
        for (const item of data.results) {
          const imgUrl = item.urls.regular + '&w=800&q=80';
          const id = `${q.label}_${count + 1}`;
          const destPath = path.join(destDir, `${id}.jpg`);
          
          console.log(`Downloading: ${id} (${q.term})`);
          try {
            await downloadFile(imgUrl, destPath);
            imagesList.push({
              id: id,
              path: `assets/images/${id}.jpg`,
              description: item.alt_description || q.term,
              type: 'image'
            });
            count++;
          } catch (err) {
            console.error(`✕ Failed to download ${id}:`, err.message);
          }
        }
      }
    } catch (e) {
      console.error(`✕ Error searching for ${q.term}:`, e.message);
    }
  }

  // Update catalog
  let catalog = {};
  if (fs.existsSync(catalogPath)) {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  }
  catalog.images = imagesList;
  delete catalog.illustrations; // Clean up old illustration lists
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));

  console.log(`\n✅ Download complete! Generated catalog with ${imagesList.length} photos.`);
}

start().catch(console.error);
