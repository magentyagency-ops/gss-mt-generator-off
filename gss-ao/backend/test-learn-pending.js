const { learnPendingSollicitations } = require('./src/generation/learn_sollicitation');
require('dotenv').config({path: '../.env'});

learnPendingSollicitations().then(console.log).catch(console.error);
