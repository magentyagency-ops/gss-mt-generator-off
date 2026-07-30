import { requestContext } from './src/core/supabase';
import { MemoireGenerator } from './src/generation/memoire_generator';

async function run() {
  await requestContext.run({ accessToken: 'mock', userId: 'mock' }, async () => {
    try {
      const generator = new MemoireGenerator();
      const result = await generator.detectMissingInfo('896df502-6e35-4e52-b519-0e7233188f97', { force: false }); // false so it fetches from cache
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(e);
    } finally {
      process.exit(0);
    }
  });
}
run();
