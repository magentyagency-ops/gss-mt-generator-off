// Tour 7 (T7CS-5, T7N-5) : schéma de secours du bloc 1 sur le texte du rejeu cstb 551 (et sur le b1 du vérificateur).
import fs from 'fs';
import { specSecoursBesoin, specSecoursPuces, etapesDuPerimetre } from '../../src/generation/reponse_libre_v2';
for (const f of process.argv.slice(2)) {
  const t = f.endsWith('.json') ? JSON.parse(fs.readFileSync(f, 'utf-8')).sections.b1_comprehension : fs.readFileSync(f, 'utf-8');
  const perim = t.split(/^(?=##\s)/m).find((p: string) => /^##\s+Le périmètre/i.test(p)) || '';
  console.log('== ', f);
  console.log('périmètre :', JSON.stringify(etapesDuPerimetre(perim), null, 1));
  console.log('secours besoin :', JSON.stringify(specSecoursBesoin(t)?.params?.etapes, null, 1));
  console.log('secours puces :', JSON.stringify(specSecoursPuces(t)?.params?.etapes, null, 1));
}
