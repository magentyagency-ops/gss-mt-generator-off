import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { recalerSurReference, texteBrut } from '../src/generation/memoire_type_cadre';
import { calculerDimensionnement, lignesEquipe, profilAgentSecurite } from '../src/generation/dimensionnement';
import { sansEtirementRetourLigne } from '../src/generation/memoire_generator';

/** Tour 2 (T2C-5, ca_normandie 221) : tableau de l'équipe dédiée complet et cohérent avec l'effectif annoncé. */
describe('tableau de l’équipe dédiée (cadre imposé)', () => {
  const reference = texteBrut(`Organisation des effectifs :

| Catégorie de personnel | Qualification | Nombre | Observations |
|---|---|---|---|
| Agent de sécurité incendie | SSIAP 1 | 33 | 1001 h par semaine, soit 32,39 ETP |
| Chef d'équipe de sécurité incendie | SSIAP 2 | 8 | 224,25 h par semaine, soit 7,26 ETP |
| Agent de sécurité | CQP APS | 42 | 1277,52 h par semaine, soit 41,34 ETP |

Nous mettons en place une équipe de 83 agents titulaires, qui assurent les missions de façon régulière.`);

  it('toutes les lignes du tableau ou aucune, même sous une limite de mots', () => {
    const reponse = `Organisation des effectifs :
Catégorie de personnel : Qualification : Nombre : Observations
Agent de sécurité incendie : SSIAP 1 : 33 : 1001 h par semaine, soit 32,39 ETP
Chef d'équipe de sécurité incendie : SSIAP 2 : 8 : 224,25 h par semaine, soit 7,26 ETP

Nous mettons en place une équipe de 83 agents titulaires, qui assurent les missions de façon régulière.`;
    const r = recalerSurReference(reference, reponse, { limite: true, maxMots: 40 });
    expect(r.texte).toContain('Agent de sécurité : CQP APS : 42');
    const lignes = r.texte.split('\n');
    const i = lignes.findIndex((l) => l.startsWith('Chef d\'équipe'));
    expect(lignes[i + 1]).toMatch(/^Agent de sécurité : CQP APS : 42/);
    const somme = lignes.filter((l) => / : \d+ : /.test(l)).reduce((s, l) => s + Number(/ : (\d+) : /.exec(l)![1]), 0);
    expect(somme).toBe(83);
  });

  it('aucune ligne du tableau dans la réponse : rien n’est imposé', () => {
    const r = recalerSurReference(reference, 'Nous mettons en place une équipe de 83 agents titulaires, qui assurent les missions de façon régulière.', { limite: true, maxMots: 30 });
    expect(r.texte).not.toContain('CQP APS : 42');
  });

  it('« ADS » et « Agent de sécurité » : une seule catégorie, heures additionnées', () => {
    expect(profilAgentSecurite('ADS', 'ADS')).toBe('CQP APS');
    expect(profilAgentSecurite('Agent de sécurité', 'ADS (niveau 2, échelon 2)')).toBe('ADS (niveau 2, échelon 2)');
    expect(profilAgentSecurite('Agent de sécurité incendie', 'SSIAP 1')).toBe('');
    const dce = 'Agent de sécurité du lundi au vendredi de 8h à 18h. ADS du lundi au dimanche de 7h à 19h.';
    const d = calculerDimensionnement({ postes: [
      { profil: 'Agent de sécurité', qualification: 'Agent de sécurité', citation: 'Agent de sécurité du lundi au vendredi de 8h à 18h', plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'], debut: '08:00', fin: '18:00' }] },
      { profil: 'ADS', qualification: 'ADS', citation: 'ADS du lundi au dimanche de 7h à 19h', plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], debut: '07:00', fin: '19:00' }] },
    ] }, dce)!;
    expect(d.profils).toHaveLength(1);
    expect(d.profils[0].heuresSemaine).toBe(134);
    expect(lignesEquipe(d).split('\n')).toHaveLength(1);
    expect(lignesEquipe(d)).toMatch(/^\| Agent de sécurité \| CQP APS \| \d+ \|/);
  });

  it('Word : une ligne qui finit par un retour à la ligne n’est plus étirée (option à sa place dans le schéma)', () => {
    const zipDe = (settings: string) => { const z = new PizZip(); z.file('word/settings.xml', settings); return z; };
    const W = '<w:settings xmlns:w="w">';
    const z1 = zipDe(`${W}<w:compat><w:compatSetting w:name="compatibilityMode" w:val="15"/></w:compat><w:rsids/></w:settings>`);
    expect(sansEtirementRetourLigne(z1)).toBe(true);
    expect(z1.file('word/settings.xml')!.asText()).toContain('<w:compat><w:doNotExpandShiftReturn/><w:compatSetting');
    const z2 = zipDe(`${W}<w:compat><w:noLeading/><w:useFELayout/></w:compat></w:settings>`);
    sansEtirementRetourLigne(z2);
    expect(z2.file('word/settings.xml')!.asText()).toContain('<w:noLeading/><w:doNotExpandShiftReturn/><w:useFELayout/>');
    const z3 = zipDe(`${W}<w:defaultTabStop w:val="708"/><w:rsids/></w:settings>`);
    sansEtirementRetourLigne(z3);
    expect(z3.file('word/settings.xml')!.asText()).toContain('<w:compat><w:doNotExpandShiftReturn/></w:compat><w:rsids/>');
    expect(sansEtirementRetourLigne(z3)).toBe(false);
  });
});
