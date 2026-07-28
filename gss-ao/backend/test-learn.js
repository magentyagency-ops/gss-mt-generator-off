const { learnPendingSollicitations } = require('./src/generation/learn_sollicitation');
require('dotenv').config({path: '../.env'});

async function run() {
  const res = await learnPendingSollicitations();
  console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
