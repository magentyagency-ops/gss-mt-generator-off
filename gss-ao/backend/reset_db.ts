import { Client } from 'pg';
require('dotenv').config();
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => 
  c.query(`UPDATE dossiers SET memoire_cadre_state = memoire_cadre_state - 'missingDetectedAt' WHERE id = '896df502-6e35-4e52-b519-0e7233188f97'`)
).then(() => {
  console.log('Cache cleared!');
  c.end();
}).catch(console.error);
