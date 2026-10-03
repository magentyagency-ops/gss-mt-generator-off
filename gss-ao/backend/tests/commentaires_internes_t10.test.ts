// T10REG-1 : le filtre des commentaires internes ne retire plus les phrases légitimes (« documenté », « indiqué dans le
// CCTP », « sont à valider par le responsable sécurité ») ; les vrais méta-commentaires restent retirés.
import { describe, it, expect } from 'vitest';
import { retirerCommentairesInternes } from '../src/generation/base_memoires';

describe('phrases légitimes gardées (T10REG-1)', () => {
  const garder = [
    '## Un interlocuteur identifié et une culture de pilotage documenté',
    'Chaque événement est documenté avec :',
    "Toute ronde incomplète fait l'objet d'une alerte et d'une analyse documentée, afin de distinguer un oubli de pointage d'une impossibilité d'accès. Cette analyse est transmise au responsable de site.",
    'Le suivi des clés, badges et autres moyens d’accès repose sur une procédure documentée et sur une traçabilité dans Trackforce.',
    'GSS applique cette exigence aux rondes effectuées dans les 13 bâtiments mentionnés par le CCTP.',
    'Les agents respectent les hauteurs maximales d’accès indiquées par le CCTP : 2 m pour Gare-Sud.',
    'La formation continue est adaptée aux risques scientifiques mentionnés par le CCTP.',
    '- GSS respecte les horaires d’ouverture indiqués dans le CCTP.',
    '- Les plannings mensuels sont à valider par le responsable sécurité du site avant diffusion aux agents.',
    '- GSS applique les consignes de sécurité précisées dans le cahier des charges.',
  ];
  for (const t of garder) {
    it(t.slice(0, 70), () => {
      expect(retirerCommentairesInternes(t)).toEqual({ texte: t, retires: [] });
    });
  }
  it('la liste qui suit « Chaque événement est documenté avec : » garde son introduction', () => {
    const t = "Chaque événement est documenté avec :\n\n- l'heure et le lieu ;\n- la nature de l'alarme ou de l'incident ;\n- les actions engagées.";
    expect(retirerCommentairesInternes(t).texte).toBe(t);
  });
});

describe('méta-commentaires toujours retirés (T10REG-1)', () => {
  const retirer = [
    'Le canal documenté est donc le téléphone et le courriel.',
    'Le marché est conclu pour une durée de 3 ans — aucune reconduction indiquée dans le CCTP.',
    'Le marché dure 3 ans ; aucune reconduction précisée dans le CCTP fourni.',
    'Les interventions sur alarmes incendie et anti-intrusion sont documentées par GSS.',
    'Aucune procédure de levée de doute n’est documentée.',
    'Le délai de mobilisation applicable à ce site est à valider avec l’acheteur.',
    'Dimensionnement proposé par GSS : à valider par GSS avant le dépôt définitif de l’offre.',
    'Les effectifs de nuit, non précisés dans le CCTP, sont proposés par GSS.',
  ];
  for (const t of retirer) {
    it(t.slice(0, 70), () => {
      const r = retirerCommentairesInternes(`Nos agents sont formés au poste. ${t}`);
      expect(r.texte.trim()).toBe('Nos agents sont formés au poste.');
      expect(r.retires.length).toBe(1);
    });
  }
});
