import fs from 'fs';
import { variablesDuMarche, chargerMemoireType } from '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/generation/memoire_type';
const mt = chargerMemoireType();
const dce = fs.readFileSync('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/_corpus_verif/_dce_textes/cstb.txt', 'utf-8');
for (const n of ['LE CENTRE SCIENTIFIQUE ET TECHNIQUE DU BATIMENT', 'CENTRE SCIENTIFIQUE ET TECHNIQUE DU BATIMENT']) console.log(JSON.stringify(variablesDuMarche(mt, { cover: { client: n }, analyse: { clientName: n }, dce, registre: [] } as any, {}).CLIENT));
