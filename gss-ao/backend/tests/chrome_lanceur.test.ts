import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { lanceurChromeConteneur } from '../src/generation/marp_generator';

/**
 * Production (audit 1.3) : Marp CLI 4.4 ne sait pas transmettre d'options à Chrome. En conteneur Linux, CHROME_PATH
 * désigne scripts/chrome-conteneur.sh, qui ajoute --disable-dev-shm-usage puis exécute le vrai Chrome. Mac : inchangé.
 */
const LANCEUR = path.resolve(__dirname, '../scripts/chrome-conteneur.sh');
const CHROME = '/opt/chrome/chrome';

afterEach(() => { delete process.env.GSS_CHROME_LANCEUR; });

describe('lanceur Chrome pour conteneur', () => {
  it('Mac et Windows : aucun lanceur (rendu inchangé)', () => {
    expect(lanceurChromeConteneur(CHROME, 'darwin')).toBeNull();
    expect(lanceurChromeConteneur(CHROME, 'win32')).toBeNull();
  });
  it('Linux : le lanceur', () => {
    expect(lanceurChromeConteneur(CHROME, 'linux')).toBe(LANCEUR);
  });
  it('GSS_CHROME_LANCEUR=non le désactive, =oui l\'impose', () => {
    process.env.GSS_CHROME_LANCEUR = 'non';
    expect(lanceurChromeConteneur(CHROME, 'linux')).toBeNull();
    process.env.GSS_CHROME_LANCEUR = 'oui';
    expect(lanceurChromeConteneur(CHROME, 'darwin')).toBe(LANCEUR);
  });
  it('sans Chrome connu, ou CHROME_PATH désignant déjà le lanceur : pas de second lanceur', () => {
    expect(lanceurChromeConteneur(undefined, 'linux')).toBeNull();
    expect(lanceurChromeConteneur(LANCEUR, 'linux')).toBeNull();
  });
  it('le script est exécutable et ajoute --disable-dev-shm-usage avant les arguments de Marp', () => {
    expect(fs.statSync(LANCEUR).mode & 0o111).not.toBe(0);
    const r = spawnSync(LANCEUR, ['--headless=new', '--user-data-dir=/tmp/x y', 'about:blank'], {
      encoding: 'utf-8', env: { ...process.env, GSS_CHROME_REEL: '/bin/echo' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('--disable-dev-shm-usage --headless=new --user-data-dir=/tmp/x y about:blank\n');
  });
  it('l\'option inexistante --puppeteer-launch-args n\'est plus passée à Marp', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../src/generation/marp_generator.ts'), 'utf-8');
    expect(code).not.toMatch(/'--puppeteer-launch-args'/);
  });
});
