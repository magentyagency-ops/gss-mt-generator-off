const fs = require('fs');
const path = require('path');

const srcDir = '/tmp/undraw/svg';
const destDir = path.join(__dirname, 'assets', 'illustrations');
const catalogPath = path.join(__dirname, 'assets', 'catalog.json');

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const selectedSvgs = {
  'security_o890.svg': { id: 'security', description: 'Sécurité globale, cadenas' },
  'security_on_6e8f.svg': { id: 'security_on', description: 'Protection activée, bouclier' },
  'secure_data_0rwp.svg': { id: 'secure_data', description: 'Données sécurisées, RGPD' },
  'secure_server_s9u8.svg': { id: 'secure_server', description: 'Serveur sécurisé, données' },
  'safe_bnk7.svg': { id: 'safe', description: 'Coffre-fort, protection des biens' },
  'alert_mc7b.svg': { id: 'alert', description: 'Alerte, urgence, notification' },
  'team_ih79.svg': { id: 'team', description: 'Équipe, collaboration, agents' },
  'meeting_115p.svg': { id: 'meeting', description: 'Réunion, planification' },
  'server_status_5pbv.svg': { id: 'server_status', description: 'Statut du serveur, salle de contrôle' },
  'data_report_bi6l.svg': { id: 'data_report', description: 'Rapport, main courante, documents' },
  'building_blocks_n0nc.svg': { id: 'building_blocks', description: 'Construction, infrastructure' },
  'connecting_teams3_1pgn.svg': { id: 'connecting_teams', description: 'Équipes connectées, communication' },
  'Cautious_dog_q83f.svg': { id: 'cautious_dog', description: 'Agent cynophile, chien de garde' },
  'cloud_hosting_aodd.svg': { id: 'cloud_hosting', description: 'Hébergement, technologie' }
};

const illustrationsList = [];

for (const [filename, info] of Object.entries(selectedSvgs)) {
  const srcPath = path.join(srcDir, filename);
  const destFile = `${info.id}.svg`;
  const destPath = path.join(destDir, destFile);

  if (fs.existsSync(srcPath)) {
    let content = fs.readFileSync(srcPath, 'utf8');
    // Replace unDraw default color with GSS Red (#dc2626)
    content = content.replace(/#6c63ff/gi, '#dc2626');
    fs.writeFileSync(destPath, content);
    
    illustrationsList.push({
      id: info.id,
      path: `assets/illustrations/${destFile}`,
      description: info.description,
      type: 'illustration'
    });
    console.log(`Copied and colorized ${destFile}`);
  } else {
    console.warn(`File not found: ${srcPath}`);
  }
}

// Update catalog
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
catalog.illustrations = illustrationsList;
// Remove old unsplash images
delete catalog.images;
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));

console.log('Catalog updated with new illustrations.');
