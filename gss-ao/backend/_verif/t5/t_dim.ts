import { calculerDimensionnement, etapesSchemaDemande, ecartsCouvertureCasPratique, questionCouvertureCasPratique, lireMisesEnSituation, dispositifMiseEnSituation, completerMisesEnSituation, miseEnSituationDuChamp } from '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/generation/dimensionnement';
import { specProcessBesoin } from '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/backend/src/generation/reponse_libre_v2';
import fs from 'fs';
const dce = fs.readFileSync('/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao/_corpus_verif/_dce_textes/etampes2.txt','utf-8');
const P=['Agent de sécurité','Maître-chien','Agent de sécurité incendie','Encadrant'];
const pl=[{libelle:'Dimanche férié, 6 h–21 h',debut:'06:00',fin:'21:00'},{libelle:'Nuit, 21 h–6 h',debut:'21:00',fin:'06:00'},{libelle:'Lundi férié, 6 h–21 h',debut:'06:00',fin:'21:00'}];
const n:any={ 'Dimanche férié, 6 h–21 h':[10,1,1,1],'Nuit, 21 h–6 h':[4,1,1,0],'Lundi férié, 6 h–21 h':[10,1,1,1]};
const rep={postes:[],cas_pratique:{plages:pl,dispositif:pl.flatMap(p=>P.map((pr,i)=>({plage:p.libelle,profil:pr,en_service:n[p.libelle][i]})))},
 mises_en_situation:[{libelle:'Sécurisation de la fête communale sur la voie publique pendant 48 heures',citation:'sécurisation d’un périmètre de manifestation sur la voie publique pour 48 heures',capacite:null,pif:0,detecteurs:0,dispositif:[{fonction:'agents de sécurité',nombre:8}]}]};
const d=calculerDimensionnement(rep,dce)!;
console.log(JSON.stringify(d.misesEnSituation));
console.log(dispositifMiseEnSituation(d.misesEnSituation![0]));
console.log(ecartsCouvertureCasPratique(d,dce));
console.log(questionCouvertureCasPratique(d,dce));
const e=etapesSchemaDemande('',d)!;
console.log(JSON.stringify(e,null,1));
console.log(JSON.stringify(specProcessBesoin(e,'flux')));
const champ10='Mise en situation appliquée : Descriptif de la solution suggérée par le candidat en cas d’absence de 2 agents et d’1 chien ne pouvant exercer ; Descriptif de la solution en cas de débordement: intrusion au sein du périmètre défini et dégradation de type vandalisme';
console.log('champ10', miseEnSituationDuChamp(champ10, d.misesEnSituation![0]), completerMisesEnSituation('x', d, champ10).n);
