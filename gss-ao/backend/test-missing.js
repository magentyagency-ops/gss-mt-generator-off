require('dotenv').config({path: '../.env'});
const { DB } = require('./src/core/db');

async function test() {
  try {
    const supabase = require('./src/core/supabase').getScopedClient();
    const { data } = await supabase.from('dossiers').select('id, nom_acheteur, memoire_cadre_state');
    for (const d of data) {
      const mf = d.memoire_cadre_state?.missingFields;
      if (mf && mf.length > 0) {
        console.log(`\nDossier: ${d.nom_acheteur}`);
        console.log(`Missing fields count: ${mf.length}`);
        console.log(mf.map(m => m.label));
      }
    }
  } catch (e) {
    console.error(e);
  }
}
test();
