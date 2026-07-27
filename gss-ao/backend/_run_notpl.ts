import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;

import { MemoireGenerator } from './src/generation/memoire_generator';
const start = Date.now();
const ts = () => ((Date.now()-start)/1000).toFixed(1).padStart(6)+'s';
(async () => {
  const gen = new MemoireGenerator();
  console.log(`${ts()}  >>> début generateFullMarpPdf`);
  try {
    const res = await (gen as any).generateFullMarpPdf('dossier-1782847600199', (p:number,m:string)=>{
      console.log(`${ts()}  [${String(p).padStart(3)}%] ${m}`);
    });
    console.log(`${ts()}  ✅ TERMINÉ → ${res.filePath}`);
    const fs = require('fs');
    console.log('PDF existe:', fs.existsSync(res.filePath), fs.existsSync(res.filePath)? (fs.statSync(res.filePath).size/1024).toFixed(0)+' Ko':'');
  } catch(e:any){
    console.log(`${ts()}  ❌ ERREUR: ${e.message}`);
    console.log(e.stack?.split('\n').slice(0,6).join('\n'));
  }
})();
