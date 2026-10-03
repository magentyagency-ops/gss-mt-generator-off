// Campagne « zéro défaut », tour 1 : nom de l'acheteur (T1-COH-1 / T1F-6, T1-GEN-5, T1-GEN-9, T1-COH-6).
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { articleEtNom, formesClient, preparerMemoireType, publierMemoire, nomAcheteurAffiche } from '../src/generation/memoire_type';

const texte = (client: string, dce: string) => {
  const prep: any = preparerMemoireType({ dce, analyse: { clientName: client }, cover: { client } } as any);
  return { v: prep.variables.CLIENT, t: publierMemoire(prep).map((r: any) => `${r.titre || ''}\n${r.texte || ''}`).join('\n') };
};
const DCE_CA = path.resolve(__dirname, '../../_corpus_verif/_dce_textes/ca_normandie.txt');

describe('forme courte : jamais coupée dans une parenthèse (T1-COH-1, T1F-6)', () => {
  it('« (SAR de Rouen – BOP Normand) » donne « le SAR de Rouen », jamais « BOP Normand) »', () => {
    const dce = fs.existsSync(DCE_CA) ? fs.readFileSync(DCE_CA, 'utf-8') : 'Le SAR de Rouen lance le marché. Le SAR de Rouen assure le suivi.';
    const nom = 'Ministère de la Justice – Service administration régional de Rouen (SAR de Rouen – BOP Normand)';
    expect(formesClient(nom, dce).court).toMatchObject({ article: 'le', nom: 'SAR de Rouen' });
    const { t } = texte(nom, dce);
    expect(t).not.toMatch(/BOP Normand\)/);
  });
  it('groupement de commandes : le coordonnateur en tête, la préposition répétée devant chaque membre', () => {
    const dce = "La Ville de Rouen, coordonnateur du groupement de commandes constitué avec le CCAS de Rouen, lance un marché. La Ville de Rouen se réserve le droit. Le CCAS de Rouen.";
    for (const nom of ['Groupement de commandes Ville de Rouen – CCAS de Rouen', 'GROUPEMENT DE COMMANDES CONSTITUE ENTRE LA VILLE DE ROUEN ET LE CCAS DE ROUEN', 'Ville de Rouen et CCAS de Rouen']) {
      const { v, t } = texte(nom, dce);
      expect(v.valeur).toBe('Ville de Rouen et le CCAS de Rouen');
      expect(v.article).toBe('la');
      expect(t).toContain('dédiée à la Ville de Rouen et au CCAS de Rouen');
      expect(t).not.toMatch(/du Ville|à la Ville de Rouen et le CCAS|et CCAS de Rouen/);
    }
  });
  it('« (coordonnateur du groupement …) » est retiré du nom', () => {
    const { v, t } = texte('Ville de Rouen (coordonnateur du groupement de commandes Ville de Rouen / CCAS de Rouen)', 'La Ville de Rouen lance un marché.');
    expect(v.valeur).toBe('Ville de Rouen');
    expect(t).not.toMatch(/coordonnateur du groupement/);
  });
});

describe('article de l’acheteur lu dans le DCE, emplois sans article compris (T1-GEN-5)', () => {
  it('« Paris La Défense » : « de Paris La Défense » majoritaire, une seule fois « au Paris la Défense » → pas d’article', () => {
    const dce = `${'Les sites de Paris La Défense sont surveillés. '.repeat(5)}${'Le titulaire remet à Paris La Défense son rapport. '.repeat(3)}Le titulaire se rend au Paris la Défense Arena.`;
    expect(articleEtNom('Paris La Défense', dce).article).toBe('');
    const { t } = texte('Paris La Défense', dce);
    expect(t).not.toMatch(/(?:le|du|au) Paris La Défense/);
  });
  it('nom propre commençant par une voyelle, toujours sans article dans le DCE : jamais « l’Enedis »', () => {
    expect(articleEtNom('Enedis', 'Enedis confie au titulaire la surveillance de ses sites. Les sites d’Enedis…').article).toBe('');
    expect(articleEtNom('Habitat 76', 'Habitat 76 lance la présente consultation. Les résidences d’Habitat 76…').article).toBe('');
    expect(articleEtNom('Orange').article).toBe('');
    expect(articleEtNom('Alcéane').article).toBe('');
  });
  it('nom commun d’institution ou sigle : l’article reste (« l’Université », « l’Hôtel de Ville », « l’ACOSS »)', () => {
    expect(articleEtNom('Université de Rouen').article).toBe("l'");
    expect(articleEtNom('Hôtel de Ville de Caen').article).toBe("l'");
    expect(articleEtNom('ACOSS').article).toBe("l'");
    // « Hôtel de Ville de Rouen » dans le DCE ne fait pas perdre l'article de « Ville de Rouen ».
    expect(articleEtNom('Ville de Rouen', "Les bureaux de l'Hôtel de Ville de Rouen. Les bâtiments de l'Hôtel de Ville de Rouen. Hôtel de Ville de Rouen.").article).toBe('la');
  });
});

describe('service après le tiret, nom court (T1-GEN-9)', () => {
  it('« Région Normandie – Direction des achats » : forme courte « la Région Normandie »', () => {
    expect(formesClient('Région Normandie – Direction des achats', 'La Région Normandie lance… les lycées de la Région Normandie…').court).toMatchObject({ article: 'la', nom: 'Région Normandie' });
    const { t } = texte('Région Normandie - Direction des Lycées', 'La Région Normandie lance… les lycées de la Région Normandie…');
    expect(t).not.toMatch(/Pour la Région Normandie - Direction des Lycées/);
  });
});

describe('nom de l’acheteur en capitales (T1-COH-6)', () => {
  it('nom d’institution seulement en capitales dans le DCE : casse usuelle, accents restitués', () => {
    expect(texte('CENTRE HOSPITALIER DU ROUVRAY', 'CENTRE HOSPITALIER DU ROUVRAY, 76300 SOTTEVILLE-LES-ROUEN.').v.valeur).toBe('Centre hospitalier du Rouvray');
    expect(texte('MAIRIE DE GRAND-QUEVILLY', 'MAIRIE DE GRAND-QUEVILLY - 76120 GRAND-QUEVILLY.').v.valeur).toBe('Mairie de Grand-Quevilly');
  });
  it('couverture et pieds de page : la forme corrigée de CLIENT, jamais le nom brut en capitales', () => {
    const dce = "L'Établissement public du domaine et du château de Fontainebleau (ci-après l'EPCF). L'établissement public du château de Fontainebleau. L'EPCF. L'EPCF.";
    const prep: any = preparerMemoireType({ dce, analyse: { clientName: 'ETABLISSEMENT PUBLIC DU CHATEAU DE FONTAINEBLEAU' } } as any);
    expect(nomAcheteurAffiche(prep.variables.CLIENT, 'ETABLISSEMENT PUBLIC DU CHATEAU DE FONTAINEBLEAU')).toBe('Établissement public du château de Fontainebleau');
  });
});
