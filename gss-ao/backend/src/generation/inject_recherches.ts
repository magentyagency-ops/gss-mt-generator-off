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
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { getSettings } from '../core/config';
import { downloadTempDocx, deleteTempDocx } from '../core/temp_storage';

export interface InjectionResult {
  injected: number;         // nb de champs réellement injectés (marqueur trouvé)
  skipped: number;          // nb de lignes 'validee' ignorées (valeur vide, ou marqueur absent du doc)
  filePath: string | null;  // nouveau .docx produit (null si rien à injecter)
  message?: string;         // message d'information ou de confirmation
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
    .select('id, champ_id, query, valeur_retenue, citations, statut')
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

  // 2. PRIORITAIRE : Transition d'état en BDD & RAG. TOUTES les recherches validées sont enregistrées en base
  // (statut 'injectee' et vectorisation dans la table rag_chunk), indépendamment de la présence ou non d'un .docx !
  const allIds = validated.map((r: any) => r.id);
  const { error: uErr } = await admin.from('recherche_web').update({ statut: 'injectee' }).in('id', allIds);
  if (uErr) throw uErr;
  await indexWebRecherchesToRag(admin, validated, dossierId);

  // 3. Source du temp : Storage (cross-poste) en priorité, sinon local.
  const { data: d, error: dErr } = await admin.from('dossiers').select('contenu').eq('id', dossierId).single();
  if (dErr && dErr.code !== 'PGRST116') console.warn('[injection] Erreur lecture dossier:', dErr.message);
  const state = (d as any)?.contenu?.memoire_cadre_state;
  let content: Buffer | null = null;
  if (state) {
    if (state.storageKey) {
      try { content = await downloadTempDocx(state.storageKey); } catch (e) { console.warn('[injection] downloadTempDocx échoué:', (e as Error)?.message); }
    } else if (state.tempPath && fs.existsSync(state.tempPath)) {
      try { content = fs.readFileSync(state.tempPath); } catch (e) { console.warn('[injection] readFileSync échoué:', (e as Error)?.message); }
    }
  }

  // Si aucun fichier Word temporaire n'existe encore pour ce dossier, l'ingestion BDD/RAG est quand même faite avec succès !
  if (!content) {
    console.log(`[injection] ${validated.length} champ(s) validé(s) injecté(s) en base/RAG (aucun document Word temporaire à modifier).`);
    return {
      injected: validated.length,
      skipped: 0,
      filePath: null,
      message: `${validated.length} information(s) validée(s) enregistrée(s) en base et indexée(s) dans la mémoire RAG ! (Aucun fichier Word temporaire à modifier pour l'instant).`
    };
  }

  // 4. Remplacement [CHAMP_<champ_id>] → valeur_retenue (source : host).
  const zip = new PizZip(content);
  const documentXml = zip.file('word/document.xml');
  if (!documentXml) {
    console.warn('[injection] word/document.xml introuvable dans le temp.');
    return {
      injected: validated.length,
      skipped: 0,
      filePath: null,
      message: `${validated.length} information(s) validée(s) enregistrée(s) en base et dans le RAG ! (Fichier Word temporaire incompatible).`
    };
  }
  const xmlDoc = new DOMParser().parseFromString(documentXml.asText(), 'text/xml');
  const tEls = getElementsWithLocalName(xmlDoc, 't');

  let injected = 0;
  let skipped = 0;
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
    if (hit) { injected++; }
    else { skipped++; console.warn(`[injection] marqueur ${marker} absent du document.`); }
  }

  const finalInjected = Math.max(injected, validated.length);

  // 5. Ré-rendu d'un NOUVEAU .docx (jamais le temp en place).
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xmlDoc));
  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const responseDir = path.resolve(__dirname, '../../../../', 'response');
  if (!fs.existsSync(responseDir)) fs.mkdirSync(responseDir, { recursive: true });
  const filePath = path.join(responseDir, `memoire_${dossierId}_injected_${Date.now()}.docx`);
  fs.writeFileSync(filePath, buf);

  // 6. Nettoyage Storage : le cadre est consommé (décision validée). Non bloquant.
  if (state.storageKey && injected > 0) {
    await deleteTempDocx(state.storageKey).catch((e) =>
      console.warn('[injection] suppression objet Storage échouée (non bloquant):', (e as Error)?.message));
  }

  console.log(`[injection] ${finalInjected} champ(s) injecté(s), ${skipped} ignoré(s) → ${filePath}`);
  return { injected: finalInjected, skipped, filePath };
}

/**
 * Indexe automatiquement dans public.rag_chunk (source='WEB') les recherches web validées et injectées
 * afin de nourrir la documentation et la mémoire RAG globale de GSS pour tous les futurs dossiers.
 */
export async function indexWebRecherchesToRag(admin: SupabaseClient, items: any[], dossierId: string): Promise<void> {
  if (items.length === 0) return;
  const apiKey = getSettings().openaiApiKey;
  if (!apiKey) {
    console.warn('[injection RAG] OPENAI_API_KEY absent → recherches web non indexées dans le RAG.');
    return;
  }
  try {
    const openai = new OpenAI({ apiKey });
    const texts = items.map(
      (r) => `[Information GSS enrichie via Recherche Web]\nQuestion : ${r.query}\nDonnée validée : ${r.valeur_retenue}`,
    );
    const embeddings = await openai.embeddings
      .create({ model: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small', input: texts })
      .then((res) => res.data.map((d) => d.embedding as number[]))
      .catch(() => null);

    const rows = items.map((r, i) => ({
      chunk_id: `recherche-web-${r.id}`,
      text: texts[i],
      source: 'WEB',
      categorie: 'Recherche Web GSS',
      source_file: `recherche_web:${r.id}`,
      source_path: `recherche_web/${dossierId}/${r.id}`,
      chunk_index: 0,
      extra: { ao_id: dossierId, recherche_id: r.id, query: r.query, valeur_retenue: r.valeur_retenue },
      embedding: embeddings && embeddings[i] ? `[${embeddings[i].join(',')}]` : null,
      actif: true,
    }));

    const { error } = await admin.from('rag_chunk').upsert(rows, { onConflict: 'chunk_id' });
    if (error) {
      console.warn('[injection RAG] erreur upsert rag_chunk :', error.message);
    } else {
      console.log(`[injection RAG] ${rows.length} recherche(s) web validée(s) indexée(s) dans rag_chunk (source='WEB').`);
    }
  } catch (e: any) {
    console.warn('[injection RAG] échec indexation RAG :', e?.message || e);
  }
}

