import { MemoireGenerator, identiteCandidatForLabel } from './src/generation/memoire_generator';
import { requestContext } from './src/core/supabase';
import { DB } from './src/core/db';

async function run() {
  await requestContext.run({ accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', userId: 'mock' }, async () => {
    try {
      const generator = new MemoireGenerator();
      const dossierId = '896df502-6e35-4e52-b519-0e7233188f97';

      const dceContext = await generator['getDceContext'](dossierId);
      const templateText = await generator['getClientTemplateText'](dossierId);
      const requirements = await generator['extractRequirementsList'](templateText, dceContext);
      
      const viaRag = await generator['detectMissingViaRag'](requirements);
      
      let detected = viaRag;
      if (!detected) {
        if (templateText) {
          detected = await generator['detectMissingFromTemplate'](templateText, dceContext, '');
        } else {
          detected = await generator['detectMissingFromRequirements'](dceContext, '');
        }
      }
      
      const rawFields = detected?.fields || [];
      console.log('--- RAW FIELDS ---', rawFields.length);
      rawFields.forEach(f => console.log('- ', f.label));

      const filteredIdentite = rawFields.filter((m: any) => {
        if (identiteCandidatForLabel(m.label) !== '') {
          console.log('Dropped by identite:', m.label);
          return false;
        }
        return true;
      });
      
      const baseFields = await generator['filterAlreadyKnownInDb'](filteredIdentite, dossierId);
      console.log('--- AFTER DB FILTER ---', baseFields.length);
      filteredIdentite.forEach(f => {
        if (!baseFields.find(b => b.label === f.label)) {
          console.log('Dropped by DB filter:', f.label);
        }
      });

    } catch (e) {
      console.error(e);
    } finally {
      process.exit(0);
    }
  });
}
run();
