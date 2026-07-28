const { MemoireGenerator } = require('./src/generation/memoire_generator');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '../.env'});

// Mock getScopedClient
const supabase = require('./src/core/supabase');
supabase.getScopedClient = () => {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
};
supabase.getCurrentUserId = () => '00000000-0000-0000-0000-000000000000';

async function runTest() {
  const dossierId = '4ab4adfa-cc5f-489f-b1c7-9cf4ef299383'; // MP2026_08
  const generator = new MemoireGenerator();
  
  console.log('Running detectMissingInfo for MP2026_08...');
  const result = await generator.detectMissingInfo(dossierId);
  
  console.log('\n--- RESULT ---');
  console.log('Total missing:', result.missingFields.length);
  console.log('Missing fields:');
  result.missingFields.forEach(f => console.log(`- [${f.id}] ${f.label}`));
}

runTest().catch(console.error);
