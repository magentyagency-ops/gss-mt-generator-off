// Rejeu au plus proche (rejouer_proche.ts) d'un cadre avec Chrome (puppeteer) indisponible : les schémas non insérés
// doivent être signalés à GSS (T6-COH-3). Usage : REJEU_CATALOGUE=… npx ts-node … _verif/t6/rejeu_chrome_ko.ts <enreg> <code> <sortie>
const p = require('puppeteer');
p.launch = async () => { throw new Error('Chrome bloqué (simulation)'); };
require('./rejouer_proche');
