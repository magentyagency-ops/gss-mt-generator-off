// T10C-1 : l'interdit des photos du DCE est appliqué avec l'exception que le DCE lui donne (citedia : « Cette interdiction
// ne s'applique pas aux photographies strictement nécessaires… rapports d'intervention ») ; l'utilisation du système de
// vidéosurveillance du site n'est jamais traitée comme une prise de vue ; la phrase du DCE est citée en entier.
import { describe, it, expect } from 'vitest';
import { interditPhotosDce, interditsDce } from '../src/generation/base_memoires';
import { exigenceDuFiltre } from '../src/generation/adaptations_cctp';
import { chargerMemoireType, preparerMemoireType } from '../src/generation/memoire_type';
import { aCorpus, DCE } from './fixtures/corpus';

const EXTRAIT_CITEDIA = `Le Titulaire s’engage à respecter l’ensemble de la réglementation applicable en matière de protection des
données à caractère personnel.
Aucune photographie ou vidéo des installations ou des sites, notamment des images issues des dispositifs de
vidéosurveillance, des plans, des procédures et des documents internes, ne peut être réalisée ni diffusée, à
quelque fin que ce soit, sans l’autorisation préalable et écrite de Citédia Métropole. Cette interdiction ne
s’applique pas aux photographies strictement nécessaires à l’exercice des missions des agents, notamment
pour documenter les constats effectués et étayer leurs rapports d’intervention, sous réserve qu’elles ne
reproduisent aucun des éléments confidentiels précités.
Le chef d'équipe SSIAP 2 est chargé de réaliser des levées de doute à distance au moyen du système de vidéosurveillance.`;

const MAIN_COURANTE = "- **la réactivité** : l'agent envoie en temps réel ses rapports sur les événements de sa vacation, qu'il peut illustrer de photos ou de vidéos ; l'équipe encadrante contrôle ainsi le contenu des événements remontés ;";
const VIDEOSURVEILLANCE = "- les systèmes de vidéosurveillance : lorsque le site en est équipé, nous formons nos agents à une utilisation ciblée du système du site : présentation du système, repérage d'une situation suspecte, suivi d'un individu en vidéo, traitement des images, communication avec l'équipe terrain.";

describe('interdit des photos avec son exception (T10C-1)', () => {
  it('photos permises par l’exception, vidéos toujours interdites, citation entière', () => {
    const r = interditPhotosDce(EXTRAIT_CITEDIA)!;
    expect(r.photos).toBe(false);
    expect(r.videos).toBe(true);
    expect(r.citation).toMatch(/^Aucune photographie ou vidéo .* sans l’autorisation préalable et écrite de Citédia Métropole\. Cette interdiction ne s’applique pas aux photographies strictement nécessaires .* précités\.$/);
  });
  it('photos justificatives et formation à la vidéosurveillance gardées ; seule la vidéo est retirée de la main courante', () => {
    expect(interditsDce('Le rondier rédige un rapport illustré de photos justificatives.', EXTRAIT_CITEDIA)).toBe('Le rondier rédige un rapport illustré de photos justificatives.');
    expect(interditsDce(VIDEOSURVEILLANCE, EXTRAIT_CITEDIA)).toBe(VIDEOSURVEILLANCE);
    expect(interditsDce(MAIN_COURANTE, EXTRAIT_CITEDIA)).toBe(MAIN_COURANTE.replace(' ou de vidéos', ''));
  });
  it('la phrase adaptée est signalée avec l’exigence entière du DCE (D8)', () => {
    const ex = exigenceDuFiltre({ origine: MAIN_COURANTE, adaptee: MAIN_COURANTE.replace(' ou de vidéos', '') } as any, EXTRAIT_CITEDIA, false);
    expect(ex).toMatch(/Cette interdiction ne s’applique pas aux photographies/);
  });
  it('indicateur PHOTOS_INTERDITES faux : la main courante garde « illustrer de photos »', () => {
    const p = preparerMemoireType({ dce: EXTRAIT_CITEDIA, analyse: {} } as any, { memoireType: chargerMemoireType() });
    expect(p.indicateurs.PHOTOS_INTERDITES).toBe(false);
  });
  it('photos justificatives exigées ailleurs dans le DCE : l’interdit ne vise plus les photos', () => {
    const dce = "Il est interdit de prendre des photos des locaux techniques. Le compte rendu d'intervention comporte les photographies justificatives, lorsque celles-ci sont pertinentes.";
    expect(interditPhotosDce(dce)).toBeNull();
  });
  it('sans exception, l’interdit reste entier et la dernière puce restante termine la liste', () => {
    const dce = 'Il est interdit de prendre des photos sur le site.';
    expect(interditPhotosDce(dce)).toMatchObject({ photos: true, videos: true });
    expect(interditsDce(MAIN_COURANTE, dce)).toBe('');
    expect(interditsDce(VIDEOSURVEILLANCE, dce)).toBe(VIDEOSURVEILLANCE);
    expect(interditsDce("Formations :\n- les talkies-walkies, oreillettes, PTI ;\n- la prise de photos de constat.\n\nSuite.", dce)).toBe('Formations :\n- les talkies-walkies, oreillettes, PTI.\n\nSuite.');
  });
});

describe.skipIf(!aCorpus('citedia', 'cstb'))('corpus (T10C-1)', () => {
  it('citedia : photos permises, cstb : photos interdites', () => {
    expect(interditPhotosDce(DCE('citedia'))).toMatchObject({ photos: false, videos: true });
    expect(interditPhotosDce(DCE('cstb'))).toMatchObject({ photos: true });
  });
});
