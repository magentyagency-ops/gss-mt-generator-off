const fs = require('fs');
const path = require('path');
const https = require('https');

const ASSETS_DIR = path.join(__dirname, 'assets');
const ICONS_DIR = path.join(ASSETS_DIR, 'icons');
const IMAGES_DIR = path.join(ASSETS_DIR, 'images');

if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR);
if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR);
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);

const lucideIcons = [
  'shield', 'shield-alert', 'shield-check', 'flame', 'clock', 'calendar', 'users', 'truck', 
  'activity', 'award', 'file-text', 'leaf', 'check-circle', 'alert-triangle', 'radio', 
  'map-pin', 'search', 'lock', 'eye', 'phone', 'map', 'briefcase', 'trending-up', 'cpu', 
  'check', 'info', 'book-open', 'building', 'car', 'cctv', 'camera', 'clipboard-list', 
  'crosshair', 'badge-alert', 'badge-check', 'siren', 'bell', 'bell-ring', 'megaphone', 
  'video', 'monitor', 'headphones', 'life-buoy', 'hard-hat', 'key', 'door-closed', 
  'door-open', 'wifi', 'zap', 'battery', 'sun', 'moon', 'star', 'thumbs-up', 
  'user-check', 'users-2', 'user-cog', 'file-check', 'file-search', 'clipboard-check', 
  'shield-ban', 'shield-half', 'flame-kindling', 'extinguisher'
];

const unsplashImages = [
  { id: 'security_guard_1', url: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=1200&q=80', description: 'Agent de sécurité en surveillance ou PC de contrôle' },
  { id: 'cctv_camera', url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=1200&q=80', description: 'Caméra de télésurveillance CCTV' },
  { id: 'fire_extinguisher', url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=1200&q=80', description: 'Extincteur ou équipement incendie' },
  { id: 'walkie_talkie', url: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&w=1200&q=80', description: 'Talkie-walkie professionnel de communication' },
  { id: 'security_dog', url: 'https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?auto=format&fit=crop&w=1200&q=80', description: 'Chien de patrouille / Agent cynophile' },
  { id: 'patrol_car', url: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80', description: 'Véhicule de patrouille ou d\'intervention mobile' },
  { id: 'control_room', url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=80', description: 'Salle de contrôle ou PC de sécurité avec écrans' },
  { id: 'first_aid', url: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=1200&q=80', description: 'Trousse de premiers secours ou secourisme' },
  { id: 'team_meeting', url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80', description: 'Réunion d\'équipe ou planification' },
  { id: 'ecology_green', url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80', description: 'Feuilles vertes représentant l\'écologie et RSE' },
  { id: 'crowd_event', url: 'https://images.unsplash.com/photo-1496369654500-4f5c22501a4e?auto=format&fit=crop&w=1200&q=80', description: 'Foule lors d\'un événement, concert, salon' },
  { id: 'concert_crowd', url: 'https://images.unsplash.com/photo-1531206715517-5c561081f1ed?auto=format&fit=crop&w=1200&q=80', description: 'Foule dans un festival ou concert' },
  { id: 'firefighter', url: 'https://images.unsplash.com/photo-1582126893170-74a1740b00df?auto=format&fit=crop&w=1200&q=80', description: 'Pompier, sécurité incendie en action' },
  { id: 'security_event', url: 'https://images.unsplash.com/photo-1563200020-fbcda304f44c?auto=format&fit=crop&w=1200&q=80', description: 'Sécurité événementielle, filtrage' },
  { id: 'walkie_talkie_hand', url: 'https://images.unsplash.com/photo-1598442080054-d8ed9832729a?auto=format&fit=crop&w=1200&q=80', description: 'Agent utilisant un talkie-walkie' },
  { id: 'cctv_street', url: 'https://images.unsplash.com/photo-1594921960241-2b0e9a74ecaa?auto=format&fit=crop&w=1200&q=80', description: 'Caméra de sécurité en extérieur, rue, parking' },
  { id: 'corporate_building', url: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80', description: 'Bâtiment d\'entreprise, siège social' },
  { id: 'business_planning', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80', description: 'Équipe d\'encadrement en planification, stratégie' },
  { id: 'cyber_security', url: 'https://images.unsplash.com/photo-1584433144859-1f624e73b226?auto=format&fit=crop&w=1200&q=80', description: 'Cybersécurité, cadenas, protection des données' },
  { id: 'security_guard_back', url: 'https://images.unsplash.com/photo-1617478051745-0d045831df0a?auto=format&fit=crop&w=1200&q=80', description: 'Agent de sécurité vu de dos, surveillance' },
  { id: 'event_fence', url: 'https://images.unsplash.com/photo-1560179707-2f473057478e?auto=format&fit=crop&w=1200&q=80', description: 'Barrières de sécurité, contrôle de foule' },
  { id: 'server_room', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80', description: 'Salle des serveurs, sécurité informatique' },
  { id: 'handshake', url: 'https://images.unsplash.com/photo-1554284126-aa88f22d8b74?auto=format&fit=crop&w=1200&q=80', description: 'Poignée de main, partenariat commercial' },
  { id: 'fire_alarm', url: 'https://images.unsplash.com/photo-1505051877901-b3b33342ff16?auto=format&fit=crop&w=1200&q=80', description: 'Alarme incendie, prévention' }
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        try {
          const redirectUrl = new URL(response.headers.location, url).toString();
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        } catch (err) {
          reject(err);
        }
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

async function buildLibrary() {
  console.log('Downloading Lucide icons...');
  const iconList = [];
  for (const name of lucideIcons) {
    const url = `https://unpkg.com/lucide-static/icons/${name}.svg`;
    const dest = path.join(ICONS_DIR, `${name}.svg`);
    try {
      await downloadFile(url, dest);
      iconList.push({
        name: name,
        path: `assets/icons/${name}.svg`,
        type: 'icon'
      });
      console.log(`✓ Icon: ${name}`);
    } catch (e) {
      console.error(`✕ Failed to download icon ${name}:`, e.message);
    }
  }

  console.log('Downloading Unsplash images...');
  const imageList = [];
  for (const img of unsplashImages) {
    const dest = path.join(IMAGES_DIR, `${img.id}.jpg`);
    try {
      await downloadFile(img.url, dest);
      imageList.push({
        id: img.id,
        path: `assets/images/${img.id}.jpg`,
        description: img.description,
        type: 'image'
      });
      console.log(`✓ Image: ${img.id}`);
    } catch (e) {
      console.error(`✕ Failed to download image ${img.id}:`, e.message);
    }
  }

  const catalog = {
    icons: iconList,
    images: imageList
  };
  fs.writeFileSync(path.join(ASSETS_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2));
  console.log('\\n✅ Asset library built successfully!');
  console.log(`Downloaded ${iconList.length} icons and ${imageList.length} images.`);
}

buildLibrary().catch(console.error);
