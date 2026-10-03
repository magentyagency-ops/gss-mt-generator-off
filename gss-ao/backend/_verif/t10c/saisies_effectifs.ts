// T10N-3 : lecture des saisies d'effectifs (profil avant ou après l'effectif).
import { lireEffectifsParProfil, lireEffectifsSaisis, estValidation } from '../../src/generation/completion';
for (const m of ['Passe les SSIAP 1 à 4', 'SSIAP 1 : 4', 'SSIAP 1 = 4', 'les SSIAP 1 passent à 4', '4 pour les SSIAP 1', 'Mets 7 agents SSIAP 2 dans l\'équipe dédiée', '8', '8 titulaires et 3 suppléants', 'les SSIAP 1 doivent être 4', 'SSIAP 1 : 4 et SSIAP 2 : 3', 'Je valide les effectifs proposés', 'Les SSIAP 1 de 9 h à 18 h'])
  console.log(JSON.stringify(m).padEnd(48), JSON.stringify(lireEffectifsParProfil(m)), JSON.stringify(lireEffectifsSaisis(m)), estValidation(m));
