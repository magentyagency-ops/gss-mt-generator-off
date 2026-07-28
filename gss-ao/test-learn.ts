import { learnPendingSollicitations } from './backend/src/generation/learn_sollicitation.ts';

async function run() {
  console.log('Running learnPendingSollicitations...');
  const res = await learnPendingSollicitations();
  console.log('Result:', res);
}

run().catch(console.error);
