const fs = require('fs');

const path = 'c:/Users/linal/GSSCLARENCE/gss-ao/backend/src/generation/memoire_generator.ts';
let content = fs.readFileSync(path, 'utf8');

const target = `  public async detectMissingInfo(
    dossierId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ missingFields: Array<{ id: string; label: string; context: string; criticite: 'bloquant' | 'facultatif' | 'normal'; demande: 'web' | 'equipe' }>; completude?: number | null; contradictions?: Array<{ sujet: string; detail: string }>; cached?: boolean }> {`;

const replacement = `  public async detectMissingInfo(
    dossierId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ missingFields: Array<{ id: string; label: string; context: string; criticite: 'bloquant' | 'facultatif' | 'normal'; demande: 'web' | 'equipe' }>; completude?: number | null; contradictions?: Array<{ sujet: string; detail: string }>; cached?: boolean }> {
    try { await learnSollicitationsForDossier(dossierId); } catch (e) { console.warn('[MemoireGenerator] Erreur apprentissage sollicitations avant détection:', e); }`;

content = content.replace(target, replacement);

fs.writeFileSync(path, content);
console.log('Done!');
