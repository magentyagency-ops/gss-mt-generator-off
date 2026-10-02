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

/** Génération réelle de contrôle ca_normandie 241 : nombre recopié dans l'intitulé du poste (« 2 agents », « 1 agente »). */
describe('intitulé de poste sans nombre (ca_normandie 241)', () => {
  it('« 2 agents », « 1 agente », « 1 ADS », « 1 SSIAP 1 », « SSIAP1 » : une catégorie de GSS chacune', async () => {
    const { profilSansNombre } = await import('../src/generation/dimensionnement');
    expect(['2 agents', '1 agente', 'Agent', '1 agent', '1 ADS', '1 SSIAP 1', 'SSIAP1', 'SSIAP 2'].map(profilSansNombre))
      .toEqual(['Agent de sécurité', 'Agent de sécurité', 'Agent de sécurité', 'Agent de sécurité', 'ADS', 'SSIAP 1', 'SSIAP 1', 'SSIAP 2']);
    const dce = '• Lundi au vendredi : 2 agents de 7h45 à 17h15 au palais de justice de Rouen pour le gardiennage de surveillance\n• Samedi et dimanche : 1 agente de 8h à 18h au tribunal judiciaire du Havre pour le gardiennage\n• Lundi au vendredi : 1 SSIAP 1 de 7h à 18h15 au tribunal judiciaire du Havre en sécurité incendie';
    const d = calculerDimensionnement({ postes: [
      { profil: '2 agents', qualification: '', lieu: 'Rouen', plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'], debut: '07:45', fin: '17:15' }], citation: 'Lundi au vendredi : 2 agents de 7h45 à 17h15 au palais de justice' },
      { profil: '1 agente', qualification: '', lieu: 'Le Havre', plages: [{ jours: ['samedi', 'dimanche'], debut: '08:00', fin: '18:00' }], citation: 'Samedi et dimanche : 1 agente de 8h à 18h au tribunal' },
      { profil: '1 SSIAP 1', qualification: 'SSIAP 1', lieu: 'Le Havre', plages: [{ jours: ['lundi'], debut: '07:00', fin: '18:15' }], citation: 'Lundi au vendredi : 1 SSIAP 1 de 7h à 18h15 au tribunal' },
    ] }, dce)!;
    const lignes = lignesEquipe(d);
    expect(lignes).not.toMatch(/\| \d+ agente?s? \|/);
    expect(lignes.split('\n').map((l) => l.split('|').slice(1, 3).map((x) => x.trim()).join(' / '))).toEqual(['Agent de sécurité / CQP APS', 'Agent de sécurité incendie / SSIAP 1']);
  });
});
