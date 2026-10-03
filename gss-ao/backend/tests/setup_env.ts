// Chargé avant chaque fichier de test (vitest.config.ts, T9REG-3, T9-COH-6). Le .env du dépôt est lu d'abord, comme le
// fait src/core/config.ts (il garde la priorité quand il existe) ; à défaut, des valeurs factices hors ligne : aucun test
// n'appelle OpenAI ni Supabase, mais plusieurs modules créent leur client au chargement (« supabaseUrl is required »,
// « Clé OpenAI manquante »).
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.OPENAI_API_KEY ||= 'sk-test-hors-ligne';
process.env.SUPABASE_URL ||= 'http://127.0.0.1:9';
process.env.SUPABASE_ANON_KEY ||= 'cle-anon-hors-ligne';
