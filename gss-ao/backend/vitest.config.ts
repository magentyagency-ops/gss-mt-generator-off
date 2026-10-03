import { defineConfig } from 'vitest/config';

// Variables d'environnement des tests (T9REG-3, T9-COH-6) : sur une copie propre du dépôt (sans .env), les modules qui
// créent le client Supabase ou le client OpenAI au chargement ne doivent pas faire échouer les tests hors ligne.
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup_env.ts'],
  },
});
