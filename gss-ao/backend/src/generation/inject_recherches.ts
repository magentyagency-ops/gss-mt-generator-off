// ════════════════════════════════════════════════════════════════════════════════════════
// INJECTION d'une recherche VALIDÉE dans le mémoire — Ticket #4 phase 3
// ════════════════════════════════════════════════════════════════════════════════════════
// RÈGLE BLOQUANTE (anti-invention) : seules les lignes recherche_web de statut EXACTEMENT 'validee'
// ET portant un champ_id (lien stable [CHAMP_<id>]) peuvent toucher le document. Ni 'en_attente_validation'
// ni 'rejetee' ne sont jamais lues. On insère UNIQUEMENT `valeur_retenue` (validée par l'humain),
// JAMAIS `answer` (prose Perplexity) — suivie d'une source discrète « (source : host) ».
//
// Fonctionnement (calqué sur finalizeMemoire, format .docx garanti valide) : télécharge le temp
// (Storage privé, cible cross-poste ; fallback local), remplace chaque [CHAMP_<champ_id>] par la
// valeur, ré-rend un NOUVEAU .docx (jamais le temp en place), passe les lignes injectées en 'injectee',
// puis supprime l'objet Storage (le cadre est consommé).

import PizZip from 'pizzip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { getSettings } from '../core/config';
import { downloadTempDocx, deleteTempDocx } from '../core/temp_storage';

export interface InjectionResult {
  injected: number;         // nb de champs réellement injectés (marqueur trouvé)
  skipped: number;          // nb de lignes 'validee' ignorées (valeur vide, ou marqueur absent du doc)
  filePath: string | null;  // nouveau .docx produit (null si rien à injecter)
}

/** Client service_role (backend de confiance) — null si Supabase non configuré. */
function adminClient(): SupabaseClient | null {
  const { supabaseUrl, supabaseServiceRoleKey } = getSettings();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
}

/** Tous les éléments <w:t> du document (mêmes sémantiques que le générateur). */
function getElementsWithLocalName(node: any, name: string): any[] {
  const results: any[] = [];
  const walk = (n: any) => {
    if (n.nodeType === 1 && n.localName === name) results.push(n);
    if (n.childNodes) for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
  };
  walk(node);
  return results;
}

/** Hôte lisible d'une URL (« https://www.insee.fr/x » → « insee.fr »). */
function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return String(url); }
}

/**
 * Injecte dans le mémoire toutes les recherches VALIDÉES du dossier. Ne touche JAMAIS le document
 * pour une ligne non 'validee'. Renvoie le chemin du nouveau .docx (ou null si rien à injecter).
 */
export async function injectValidatedRecherches(dossierId: string): Promise<InjectionResult> {
  const admin = adminClient();
  if (!admin) throw new Error('[injection] Supabase (service_role) non configuré.');

  // 1. RÈGLE BLOQUANTE : uniquement statut='validee' + champ_id non nul.
  const { data: rows, error } = await admin
    .from('recherche_web')
    .select('id, champ_id, valeur_retenue, citations, statut')
    .eq('dossier_id', dossierId)
    .eq('statut', 'validee')
    .not('champ_id', 'is', null);
  if (error) throw error;

  // Sécurité en profondeur : on re-filtre en mémoire (statut EXACT + valeur non vide).
  const validated = (rows || []).filter(
    (r: any) => r.statut === 'validee' && r.champ_id != null && String(r.valeur_retenue ?? '').trim() !== '',
  );
  if (validated.length === 0) {
    return { injected: 0, skipped: (rows || []).length, filePath: null };
  }

  // 2. Source du temp : Storage (cross-poste) en priorité, sinon local.
  const { data: d, error: dErr } = await admin.from('dossiers').select('contenu').eq('id', dossierId).single();
  if (dErr) throw dErr;
  const state = (d as any)?.contenu?.memoire_cadre_state;
  if (!state) throw new Error('[injection] memoire_cadre_state introuvable pour ce dossier.');
  let content: Buffer;
  if (state.storageKey) {
    content = await downloadTempDocx(state.storageKey);
  } else if (state.tempPath && fs.existsSync(state.tempPath)) {
    content = fs.readFileSync(state.tempPath);
  } else {
    throw new Error('[injection] temp introuvable (ni Storage, ni local).');
  }

  // 3. Remplacement [CHAMP_<champ_id>] → valeur_retenue (source : host).
  const zip = new PizZip(content);
  const documentXml = zip.file('word/document.xml');
  if (!documentXml) throw new Error('[injection] word/document.xml introuvable dans le temp.');
  const xmlDoc = new DOMParser().parseFromString(documentXml.asText(), 'text/xml');
  const tEls = getElementsWithLocalName(xmlDoc, 't');

  let injected = 0;
  let skipped = 0;
  const injectedIds: any[] = [];
  for (const r of validated) {
    const marker = `[CHAMP_${r.champ_id}]`;
    const cites: string[] = Array.isArray(r.citations) ? r.citations : [];
    const host = cites.length ? hostOf(String(cites[0])) : '';
    const value = host ? `${r.valeur_retenue} (source : ${host})` : String(r.valeur_retenue);
    let hit = false;
    for (const tEl of tEls) {
      const text = tEl.textContent || '';
      if (text.includes(marker)) { tEl.textContent = text.replace(marker, value); hit = true; }
    }
    if (hit) { injected++; injectedIds.push(r.id); }
    else { skipped++; console.warn(`[injection] marqueur ${marker} absent du document → ligne ${r.id} ignorée (non injectée).`); }
  }

  // 4. Ré-rendu d'un NOUVEAU .docx (jamais le temp en place).
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xmlDoc));
  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const responseDir = path.resolve(__dirname, '../../../../', 'response');
  if (!fs.existsSync(responseDir)) fs.mkdirSync(responseDir, { recursive: true });
  const filePath = path.join(responseDir, `memoire_${dossierId}_injected_${Date.now()}.docx`);
  fs.writeFileSync(filePath, buf);

  // 5. Transitions d'état : lignes réellement injectées → 'injectee' (seul le statut change → trigger OK).
  if (injectedIds.length) {
    const { error: uErr } = await admin.from('recherche_web').update({ statut: 'injectee' }).in('id', injectedIds);
    if (uErr) throw uErr;
  }

  // 6. Nettoyage Storage : le cadre est consommé (décision validée). Non bloquant.
  if (state.storageKey && injected > 0) {
    await deleteTempDocx(state.storageKey).catch((e) =>
      console.warn('[injection] suppression objet Storage échouée (non bloquant):', (e as Error)?.message));
  }

  console.log(`[injection] ${injected} champ(s) injecté(s), ${skipped} ignoré(s) → ${filePath}`);
  return { injected, skipped, filePath };
}
