// Tour 3 : T3R-1 (groupement ENPC et IGN redevenu « l'ENPC » seul après 5698b87) et T3-COH-2 (service de l'acheteur
// après le tiret pris pour l'acheteur : « la Direction de la commande publique »).
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { formesClient } from '../src/generation/memoire_type';

const lire = (c: string) => { try { return fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_dce_textes/${c}.txt`), 'utf-8'); } catch { return ''; } };

describe('forme courte d’un groupement dont chaque entité a son sigle (T3R-1)', () => {
  const nom = "École Nationale des Ponts et Chaussées (ENPC) et Institut national de l'information géographique et forestière (IGN), pour l'École Nationale des Sciences Géographiques (ENSG, dénommée Géodata Paris)";
  it('le DCE écrit « l’ENPC » plusieurs fois : la forme courte reste « l’ENPC et l’IGN », au pluriel', () => {
    const dce = "L'ENPC lance la consultation. Les locaux de l'ENPC. Contact à l'ENPC. Le site de l'ENPC. Accueil de l'ENPC et de l'IGN.";
    const f = formesClient(nom, dce);
    expect(f.court).toEqual({ article: "l'", nom: "ENPC et l'IGN" });
    expect(f.pluriel).toBe(true);
  });
  it('DCE réel d’IGN, s’il est présent', () => {
    const d = lire('ign');
    if (!d) return;
    expect(formesClient(nom, d).court?.nom).toBe("ENPC et l'IGN");
  });
  it('ca_normandie 241 garde « le SAR de Rouen »', () => {
    const dce = 'Le SAR de Rouen. Adresse du SAR de Rouen. Plateforme du SAR de Rouen.';
    expect(formesClient("Ministère de la Justice – Service administratif régional de Rouen (SAR de Rouen), BOP Normand, pour les cours d'appel de Rouen et de Caen", dce).court?.nom).toBe('SAR de Rouen');
  });
});

describe('service de l’acheteur après le tiret : la forme courte est l’acheteur (T3-COH-2)', () => {
  it('« Ville du Havre - Direction de la commande publique » : « la Ville du Havre »', () => {
    const f = formesClient('Ville du Havre - Direction de la commande publique', 'La Ville du Havre, 76600 Le Havre, lance un marché. Direction de la commande publique.');
    expect(f.court).toMatchObject({ article: 'la', nom: 'Ville du Havre' });
  });
  it('« CHU de Rouen – Direction des achats » : « le CHU de Rouen » quand le DCE l’emploie', () => {
    const f = formesClient('Centre hospitalier universitaire de Rouen – Direction des achats et de la logistique', 'Marché du CHU de Rouen, 76031 Rouen. Le CHU de Rouen assure… Direction des achats et de la logistique.');
    expect(f.court).toMatchObject({ article: 'le', nom: 'CHU de Rouen' });
  });
  it('« Conseil départemental de la Seine-Maritime – Direction des bâtiments » : jamais « la Direction des bâtiments »', () => {
    const f = formesClient('Conseil départemental de la Seine-Maritime – Direction des bâtiments', 'Département de la Seine-Maritime, 76000 Rouen.');
    expect(f.court?.nom).toBe('Conseil départemental de la Seine-Maritime');
  });
  it('nom en capitales avec « - DIRECTION DES MOYENS GÉNÉRAUX » : jamais le service comme forme courte', () => {
    const f = formesClient('ÉTABLISSEMENT PUBLIC DE COOPÉRATION CULTURELLE ET ENVIRONNEMENTALE DU GRAND PARIS SUD - DIRECTION DES MOYENS GÉNÉRAUX ET DE LA LOGISTIQUE', lire('ign'));
    expect(f.court?.nom || '').not.toMatch(/DIRECTION/i);
  });
  it('un service qui est lui-même l’acheteur reste la forme courte (ca_normandie 221 : « le SAR de Rouen »)', () => {
    const f = formesClient("Ministère de la Justice – Service administratif régional de Rouen / BOP Normand (cours d'appel de Rouen et de Caen)", lire('ca_normandie') || 'Le SAR de Rouen. Le SAR de Rouen. Le SAR de Rouen.');
    expect(f.court?.nom).toBe('SAR de Rouen');
  });
});
