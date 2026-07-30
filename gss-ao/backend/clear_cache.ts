import { requestContext } from './src/core/supabase';
import { DB } from './src/core/db';

async function run() {
  await requestContext.run({ accessToken: 'mock', userId: 'mock' }, async () => {
    try {
      const dossierId = '896df502-6e35-4e52-b519-0e7233188f97';
      const dossier = await DB.getDossier(dossierId);
      if (dossier && dossier.memoire_cadre_state) {
        const state = dossier.memoire_cadre_state as any;
        delete state.missingDetectedAt; // Force re-detection
        await DB.saveDossier(dossierId, { memoire_cadre_state: state });
        console.log('Cache cleared for dossier', dossierId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      process.exit(0);
    }
  });
}
run();
