import { Client } from 'pg';
require('dotenv').config();

const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => 
  c.query(`SELECT source, categorie, substring(text, 1, 100) as txt, actif, embedding is not null as has_emb FROM public.rag_chunk WHERE source = 'WEB' LIMIT 5`)
).then((r) => {
  console.log('WEB:', r.rows);
  return c.query(`SELECT source, categorie, substring(text, 1, 100) as txt, actif, embedding is not null as has_emb FROM public.rag_chunk WHERE source = 'SOLLICITATION' LIMIT 5`);
}).then((r) => {
  console.log('SOLLICITATION:', r.rows);
  c.end();
}).catch(console.error);
