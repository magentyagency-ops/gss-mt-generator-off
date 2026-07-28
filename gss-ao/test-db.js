const { createClient } = require('./backend/node_modules/@supabase/supabase-js/dist/index.cjs');
require('./backend/node_modules/dotenv/lib/main.js').config({path: './.env'});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
supabase.from('dossiers').select('id, contenu').then(({data, error}) => {
  if (error) { console.error(error); return; }
  data.forEach(d => {
    const mf = d.contenu?.memoire_cadre_state?.missingFields;
    if (mf) {
      console.log(d.id, '=>', mf.length);
      if (mf.length > 0) console.log(mf.map(m=>m.label));
    }
  });
});
