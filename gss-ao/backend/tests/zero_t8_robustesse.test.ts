// Tour 8 (correcteur) : robustesse (pièce illisible, Chrome absent, repère seul sur sa ligne).
import { describe, it, expect } from 'vitest';
import { alerteCctpAbsent } from '../src/generation/memoire_generator';
import { REPERE_RE, LIGNE_REPERE_RE } from '../src/generation/completion';
import { rendreFormatCourt } from '../src/generation/format_court';
import { execFileSync } from 'child_process';
import path from 'path';

describe('pièce Word illisible nommée à GSS (T8-COH-4)', () => {
  it('CCTP.docx vide : jamais « aucun cahier des charges trouvé »', () => {
    const a = alerteCctpAbsent('\n\n--- RC.docx ---\nRÈGLEMENT DE LA CONSULTATION\nObjet : gardiennage\n', [], [], [{ nom: 'CCTP.docx', cause: 'fichier vide' }]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(/^Le cahier des charges « CCTP\.docx » n'a pas pu être lu \(fichier vide\)/);
    expect(a.join(' ')).not.toMatch(/n'a été trouvé/);
  });
  it('autre pièce illisible nommée', () => {
    const a = alerteCctpAbsent('\n\n--- CCTP.docx ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\n', [], [], [{ nom: 'AE.docx', cause: 'fichier endommagé' }]);
    expect(a.join(' ')).toMatch(/La pièce « AE\.docx » n'a pas pu être lue/);
  });
});

describe('Chrome absent au format court : erreur en français (T8-COH-5)', () => {
  it('message clair', async () => {
    const avant = process.env.CHROME_PATH;
    process.env.CHROME_PATH = '/inexistant/chrome';
    try {
      await expect(rendreFormatCourt([{ titre: 'A', texte: 'B' }], {}, 12, path.join(__dirname, '..'))).rejects.toThrow(/^Rendu PDF impossible : le navigateur \(Chrome\) est indisponible ou bloqué/);
    } finally { if (avant === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = avant; }
  });
});

describe('ligne qui ne porte qu’un repère retirée entière (T8N-4)', () => {
  it('le tableau reste d’un seul tenant', () => {
    const t = '| A | B | C |\n⟦AC:4⟧\n| D | E | F |\nTexte ⟦AC:5⟧ suite.';
    expect(t.replace(LIGNE_REPERE_RE, '').replace(REPERE_RE, '')).toBe('| A | B | C |\n| D | E | F |\nTexte  suite.');
  });
});

describe('« week-ends » accepté par le contrôle des schémas (T8N-3)', () => {
  it('ni « week » ni « ends » refusés', () => {
    const py = path.join(__dirname, '../python');
    const r = execFileSync('python3', ['-c', "import sys; sys.path.insert(0,'.'); from schemas_gss import rendu_schemas as r; print(r._orthographe_page('ends', {'ends'}), r._orthographe_page('week', {'week'}))"], { cwd: py }).toString().trim();
    expect(r).toBe('None None');
  });
});
