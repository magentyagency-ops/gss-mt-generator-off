"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Circle,
  BookOpen,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Cpu,
  FileStack,
  FileText,
  ArrowRight,
  Download,
  Globe,
  Users,
  Lock,
} from "lucide-react";
import { Badge, Button, Card, Progress } from "@/components/ui";
import { DossierNav } from "@/components/dossier-nav";
import { type DceFile } from "@/lib/gss-config";
import { AI_SECTIONS, CHAPTER_TITLES } from "@/lib/ai/sections";
import dynamic from "next/dynamic";

const DocxPreviewViewer = dynamic(
  () => import("@/components/docx-preview-viewer").then((mod) => mod.DocxPreviewViewer),
  { ssr: false }
);
import { AI_SECTIONS_B, CHAPTER_TITLES_B } from "@/lib/ai/sections-b";
import { generateSection, getApiKey, type RagChunk } from "@/lib/ai/client";
import {
  getMode,
  memoireBKey,
  getAnalyzedSlides,
  getSelectedIndexes,
  type ResponseMode,
} from "@/lib/ai/mode";
import { cn } from "@/lib/utils";
import { apiFetch, apiBase } from "@/lib/api";
import { CreditsBadge } from "@/components/credits-badge";
import { CompletionPanel } from "@/components/completion-panel";
import { use } from "react";
import { useDossier } from "../context";
import { BandeauDossier } from "@/components/visuel/bandeau-dossier";
import { EntreeEtape } from "@/components/visuel/entree-etape";
import { PointActif } from "@/components/visuel/pastille-statut";

interface GenEntry {
  text: string;
  model: string;
  tokens: number;
}
type GenMap = Record<string, GenEntry>;

// Section unifiée pour le rendu (Mode A et Mode B)
interface UISection {
  id: string;
  chapter: "I" | "II" | "III" | "IV";
  title: string;
  points?: number;
  cctpExtract?: string;
  ragChunks: RagChunk[];
}

const CHAPTERS: UISection["chapter"][] = ["I", "II", "III", "IV"];

export default function MemoirePage({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();
  // States for full DOCX generation (Backend API)
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [docxResult, setDocxResult] = useState<any>(null);
  // Recherche web à la demande (bouton « Trouver l'info sur internet ») — canaux DÉDIÉS.
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);   // échec (rouge)
  const [searchNotice, setSearchNotice] = useState<string | null>(null); // info neutre (ex. rien à chercher)
  // Demande à l'équipe (bouton « Demander à l'équipe ») — routage IA direct (aucune étape manuelle).
  const [isAskingTeam, setIsAskingTeam] = useState(false);
  const [askTeamError, setAskTeamError] = useState<string | null>(null);
  const [askTeamNotice, setAskTeamNotice] = useState<string | null>(null);
  const [creditKey, setCreditKey] = useState(0);
  // « Demande particulière » (facultative) : consigne et/ou document complémentaire pris en compte
  // pendant la génération. Sans elles, la génération est lancée exactement comme avant.
  const [demandeParticuliere, setDemandeParticuliere] = useState("");
  const [documentComplementaire, setDocumentComplementaire] = useState<File | null>(null);
  // Document généré complétable (clic sur « [À COMPLÉTER] », réponses d'équipe intégrées) : affiché
  // dès qu'un mémoire existe pour ce dossier, y compris après rechargement de la page.
  const [completionDispo, setCompletionDispo] = useState(true);

  // Modal de bypass
  const [showBypassModal, setShowBypassModal] = useState(false);
  const [bypassActive, setBypassActive] = useState(false);

  // States for Prerequisite System (Required System)
  const [crFourni, setCrFourni] = useState(false);
  const isPrerequisOk = true; // CR requirement temporarily disabled

  // Blocage de la génération tant que les manques détectés ne sont pas RÉSOLUS.
  // La résolution est calculée CHAMP PAR CHAMP par le backend (/generation-gate) : c'est la même
  // source de vérité que le refus serveur (409) sur la génération — l'ancien calcul local
  // (nbManques − nbRéponses) pouvait ouvrir le bouton alors que des champs restaient sans réponse.
  const [gate, setGate] = useState<{ canGenerate: boolean; total: number; resolved: number; unresolved: Array<{ id: string; label: string; context?: string }> } | null>(null);

  const loadGate = async () => {
    try {
      // 1. Force l'apprentissage des mails reçus pour s'assurer qu'ils sont dans le RAG avant génération
      await apiFetch(`/api/dossiers/${id}/sollicitations/learn`, { method: "POST" }).catch(() => {});
      // 2. Charge l'état de la porte de génération
      const res = await apiFetch(`/api/dossiers/${id}/generation-gate`);
      const data = await res.json();
      if (res.ok && !data.error) setGate(data);
    } catch {
      /* verrou inconnu → on laisse le serveur trancher (409 explicite) */
    }
  };

  useEffect(() => { loadGate(); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const { dossier: rawDossier, refresh: refreshDossier } = useDossier();
  const dossierInfo = rawDossier || { acheteur: "Chargement...", reference: "..." };
  const [hasTemplate, setHasTemplate] = useState(false);
  const [selectedSlidesCount, setSelectedSlidesCount] = useState<number>(0);

  // Manques détectés (persistés à l'analyse du DCE) et manques encore sans réponse, d'après le
  // verrou serveur. Tant que le verrou n'est pas chargé, on n'active pas le bouton (le serveur
  // refuserait de toute façon) — sauf s'il n'y a aucun manque connu côté dossier.
  const nbManques = gate
    ? gate.total
    : Array.isArray(dossierInfo?.memoire_cadre_state?.missingFields)
      ? dossierInfo.memoire_cadre_state.missingFields.length : 0;
  const questionsRestantes = gate ? gate.unresolved.length : nbManques;
  const canGenerate = isPrerequisOk && (questionsRestantes === 0 || bypassActive);

  // Blocage : accès au mémoire technique interdit tant que l'analyse des infos manquantes n'est pas faite.
  const hasDce = Array.isArray(dossierInfo?.dce_files) && dossierInfo.dce_files.length > 0;
  const analyseDone = !!(
    dossierInfo?.memoire_cadre_state?.missingDetectedAt ||
    dossierInfo?.memoire_cadre_state?.tempPath ||
    dossierInfo?.memoire_cadre_state?.storageKey ||
    dossierInfo?.memoire_cadre_state?.missingFields
  );

  // Progress polling state
  const [progressInfo, setProgressInfo] = useState<{
    status: string;
    progress: number;
    message: string;
    logs: string[];
  } | null>(null);

  useEffect(() => {
    // Detect template from dce_files stored in the dossier (API)
    if (dossierInfo?.dce_files && Array.isArray(dossierInfo.dce_files)) {
      const found = dossierInfo.dce_files.some((f: any) => f.type === "Mémoire (cadre)" && f.statut === "ok");
      setHasTemplate(found);
    } else {
      setHasTemplate(false);
    }
  }, [dossierInfo]);

  useEffect(() => {
    try {
      if (localStorage.getItem("gss_cr_fourni") === "true") {
        setCrFourni(true);
      }
      // Récupérer le nombre de slides sélectionnées dynamiquement
      const sel = getSelectedIndexes(id);
      setSelectedSlidesCount(sel.length);
    } catch {
      /* ignore */
    }
  }, [id]);

  async function handleGenerateFullDocx() {
    setIsGeneratingDocx(true);
    setDocxResult(null);
    setProgressInfo({ status: 'idle', progress: 0, message: 'Démarrage...', logs: [] });

    try {
      const forceQuery = bypassActive ? "?force=1" : "";
      // Send the request but don't await the final result
      let body: FormData | undefined;
      if (demandeParticuliere.trim() || documentComplementaire) {
        body = new FormData();
        if (demandeParticuliere.trim()) body.append("demande", demandeParticuliere.trim());
        if (documentComplementaire) body.append("document", documentComplementaire);
      }
      const res = await apiFetch(`/api/dce/${id}/memoire${forceQuery}`, { method: "POST", ...(body ? { body } : {}) });
      const initData = await res.json();
      
      if (!res.ok) {
        throw new Error(initData.error || initData.message || "Erreur lors du lancement de la génération");
      }

      if (initData.status === 'incomplete') {
        // Handle immediate block from generation gate
        setDocxResult({ type: "success", data: initData });
        setIsGeneratingDocx(false);
        return;
      }

      // Start progress polling for the background job
      // Le serveur marque la génération « running » avant de répondre : un état « idle » ensuite signifie
      // qu'il a redémarré en cours de route (la génération est perdue). Sans ce contrôle, l'écran restait
      // indéfiniment sur « Génération en cours… / Non démarré 0 % ».
      let idleConsecutifs = 0;
      const interval = setInterval(async () => {
        try {
          const progRes = await apiFetch(`/api/dossiers/${id}/progress`);
          if (progRes.ok) {
            const data = await progRes.json();
            idleConsecutifs = data.status === 'idle' ? idleConsecutifs + 1 : 0;
            if (idleConsecutifs >= 3) {
              clearInterval(interval);
              setIsGeneratingDocx(false);
              setProgressInfo(null);
              setDocxResult({ type: "error", message: "La génération a été interrompue : le serveur a redémarré pendant le traitement. Relancez la génération." });
              return;
            }
            setProgressInfo(data);
            
            if (data.status === 'completed') {
              clearInterval(interval);
              setIsGeneratingDocx(false);
              setDocxResult({ type: "success", data: data.data });
              setCompletionDispo(true);   // première génération : le panneau (complétion, assistant) s'affiche aussitôt
              setCreditKey((k) => k + 1); // recharge le badge crédits
              if (data.data?.file_path) {
                localStorage.setItem(`generated_docx_${id}`, data.data.file_path);
              }
            } else if (data.status === 'error' || data.status === 'incomplete') {
              clearInterval(interval);
              setIsGeneratingDocx(false);
              if (data.status === 'error') {
                setDocxResult({ type: "error", message: data.message });
              } else {
                setDocxResult({ type: "success", data: data.data || data }); // Keep incomplete UI
              }
            }
          }
        } catch (e) {
          console.error("Error polling progress:", e);
        }
      }, 2000); // Check every 2 seconds
    } catch (e: any) {
      setDocxResult({ type: "error", message: e.message });
      setIsGeneratingDocx(false);
    }
  }

  // Déclenche la recherche web des infos publiques manquantes, puis redirige vers l'écran de validation.
  async function handleFindOnInternet() {
    setIsSearching(true);
    setSearchError(null);
    setSearchNotice(null);
    try {
      const res = await apiFetch(`/api/dossiers/${id}/recherches`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec du déclenchement de la recherche.");

      // Aucun champ 'web' à rechercher (soit rien de manquant, soit tout est classé « équipe »).
      if (data.triggered === 0) {
        setSearchNotice("Aucune information à rechercher sur le web (les manques sont classés « équipe »).");
        setIsSearching(false);
        return;
      }
      // Des champs web ont été cherchés mais aucune source publique fiable n'a été trouvée.
      if (data.web === 0) {
        setSearchNotice("Recherche lancée, mais aucune source publique fiable trouvée pour ces informations.");
        setIsSearching(false);
        return;
      }
      router.push(`/dossiers/${id}/recherches`);
    } catch (e: any) {
      setSearchError(e.message || "Échec du déclenchement de la recherche.");
      setIsSearching(false);
    }
  }

  // Routage IA DIRECT : l'IA affecte chaque question interne à la personne la plus adaptée de
  // l'annuaire (Administration → Annuaire) et envoie. Aucune saisie manuelle du destinataire.
  async function handleAskTeam() {
    setAskTeamError(null);
    setAskTeamNotice(null);
    setIsAskingTeam(true);
    try {
      const res = await apiFetch(`/api/dossiers/${id}/ask-team`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de la demande à l'équipe.");
      const results: any[] = Array.isArray(data.results) ? data.results : [];
      if (results.length === 0) {
        setAskTeamNotice(data.message || "Aucune information interne à demander.");
      } else {
        const lignes = results.map(
          (r) => `${r.sent ? "✓" : "✗"} ${r.label}${r.personne ? ` → ${r.personne} (${r.email})` : " → destinataire par défaut"}`,
        );
        setAskTeamNotice(`${data.sent}/${data.triggered} envoyée(s) :\n${lignes.join("\n")}`);
      }
    } catch (e: any) {
      setAskTeamError(e.message || "Échec de la demande à l'équipe.");
    } finally {
      setIsAskingTeam(false);
      loadGate();   // rafraîchit les manques encore sans réponse
    }
  }

  // ── Blocage tant que l'analyse des infos manquantes n'est pas terminée ──────────────────
  const isLocked = !analyseDone && !bypassActive;

  if (isLocked) {
    return (
      <div className="flex h-full flex-col">
        <BandeauDossier className="animate-apparaitre pb-5 pt-5 md:pb-5 md:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
                {dossierInfo.acheteur}{dossierInfo.reference ? ` · ${dossierInfo.reference}` : ""}
              </div>
              <h1 className="mt-1.5 flex flex-wrap items-center gap-2.5 font-display text-[24px] font-bold leading-[1.15] md:text-[28px]">
                Mémoire technique — génération IA
              </h1>
            </div>
            <CreditsBadge key={creditKey} />
          </div>
        </BandeauDossier>
        <DossierNav id={id} />
        <EntreeEtape className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8 md:p-8">
          <div className="apparait w-full max-w-lg space-y-5 rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-o2 md:px-10">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-warning-soft ring-8 ring-warning-soft/40">
              <Lock className="h-9 w-9 text-warning motion-safe:animate-flotte" />
            </div>
            <h2 className="font-display text-[24px] font-bold text-foreground">Accès verrouillé</h2>
            <p className="text-[14.5px] text-muted-foreground leading-relaxed">
              {!hasDce
                ? "Aucun DCE n'a été uploadé pour ce dossier. Uploadez les pièces du DCE depuis la fiche de synthèse avant de pouvoir générer le mémoire technique."
                : "L'analyse des informations manquantes du DCE est en cours ou n'a pas encore été lancée. Retournez à la fiche de synthèse pour que l'analyse se termine avant de générer le mémoire technique."}
            </p>
            <Link href={`/dossiers/${id}`}>
              <Button size="lg" className="mt-2 gap-2">
                <ArrowRight className="h-4 w-4 rotate-180" />
                Retour à la fiche de synthèse
              </Button>
            </Link>

            <div className="mt-8 pt-6 border-t border-border w-full flex flex-col items-center">
              <p className="text-[12.5px] text-muted-foreground mb-3">Besoin du document immédiatement ?</p>
              <Button variant="outline" size="sm" onClick={() => setShowBypassModal(true)} className="border-[#F0D3A8] text-warning hover:border-warning/60 hover:bg-warning-soft">
                Ignorer l'attente et forcer l'accès
              </Button>
            </div>
          </div>
        </EntreeEtape>

        {showBypassModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(11,37,69,.45)] backdrop-blur-[4px] p-4 animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md rounded-2xl shadow-o3 border border-border overflow-hidden m-auto animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300">
              <div className="p-6">
                <div className="flex items-center gap-3 text-warning mb-4 [&>svg]:box-content [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 [&>svg]:rounded-full [&>svg]:bg-warning-soft [&>svg]:p-2.5">
                  <AlertTriangle className="h-6 w-6" />
                  <h3 className="font-display text-[20px] font-bold leading-tight">Attention : Informations manquantes</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Vous êtes sur le point de forcer la génération du mémoire alors que l'analyse n'est pas terminée ou qu'il manque des informations requises.
                  L'IA risque de laisser des trous [À COMPLÉTER] ou d'être imprécise sur ces points.
                </p>
                <p className="text-sm font-semibold text-foreground mb-6">
                  Êtes-vous sûr de vouloir continuer ?
                </p>
                <div className="flex items-center justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowBypassModal(false)}>
                    Annuler
                  </Button>
                  <Button 
                    className="bg-warning hover:bg-warning/90 hover:shadow-o2 text-warning-foreground"
                    onClick={() => {
                      setShowBypassModal(false);
                      setBypassActive(true);
                    }}
                  >
                    Confirmer et débloquer
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <BandeauDossier className="animate-apparaitre pb-5 pt-5 md:pb-5 md:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
              {dossierInfo.acheteur}{dossierInfo.reference ? ` · ${dossierInfo.reference}` : ""}
            </div>
            <h1 className="mt-1.5 flex flex-wrap items-center gap-2.5 font-display text-[24px] font-bold leading-[1.15] md:text-[28px]">
              Mémoire technique — génération IA
              {hasTemplate ? (
                <Badge variant="default" className="border-white/20 bg-white/15 font-sans text-[12px] text-white">Cadre imposé</Badge>
              ) : (
                <Badge variant="warning" className="border-[#F1B98A]/50 bg-signal/20 font-sans text-[12px] text-white">Réponse libre (AO RNE)</Badge>
              )}
            </h1>
          </div>
          <CreditsBadge key={creditKey} />
        </div>
      </BandeauDossier>

      {!isPrerequisOk && (
        <div className="bg-warning/10 border-b border-warning/30 px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-warning">Prérequis manquants pour générer le document</h3>
              <p className="text-sm text-warning mt-1">L\'IA ne peut pas générer un mémoire pertinent si les informations terrain sont manquantes. Ce dossier exige une visite obligatoire.</p>
              <ul className="mt-3 space-y-2 text-sm text-warning">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Analyse du DCE (CCTP & RC)</li>
                <li className="flex items-center gap-2">
                  {crFourni ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-warning" />}
                  Compte Rendu de Visite de Sacha
                  {!crFourni && (
                    <Button variant="outline" size="sm" className="ml-3 h-7 bg-card text-xs" onClick={() => setCrFourni(true)}>
                      Simuler l\'ajout du CR
                    </Button>
                  )}
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <DossierNav id={id} />

      <EntreeEtape className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 py-6 md:px-9 md:py-8">
        <div className="w-full max-w-4xl space-y-6">
          <div className="animate-monter rounded-2xl border border-border bg-card px-5 py-7 text-center shadow-o1 md:px-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary to-[#DCE6F2] shadow-o1">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-[26px] font-bold leading-tight">
              {hasTemplate ? "Génération par Template" : "Génération Automatique (AO RNE)"}
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">
              {hasTemplate 
                ? "Ce dossier contient un cadre de réponse imposé par le marché. L'IA lit le document complet pour y insérer directement les éléments adaptés (cocher des cases, remplir des champs spécifiques)."
                : `Aucun cadre de réponse n'est imposé. Le système va assembler un mémoire sur-mesure à partir des ${selectedSlidesCount > 0 ? selectedSlidesCount : "plusieurs"} slides pré-sélectionnées et y intégrer une synthèse personnalisée basée sur l'analyse du DCE, en gardant la charte graphique GSS intacte.`}
            </p>

            <div className="mx-auto mt-6 max-w-2xl space-y-3 rounded-xl border border-border bg-[#FAFBFD] p-4 text-left transition-[border-color,box-shadow] duration-200 focus-within:border-primary/40 focus-within:shadow-halo">
              <div>
                <label htmlFor="demande-particuliere" className="text-sm font-semibold text-foreground">Demande particulière <span className="font-normal text-muted-foreground">(facultatif)</span></label>
                <p className="text-[12.5px] text-muted-foreground">Une consigne ou un document à prendre en compte pendant la génération de ce mémoire.</p>
              </div>
              <textarea
                id="demande-particuliere"
                value={demandeParticuliere}
                onChange={(e) => setDemandeParticuliere(e.target.value)}
                disabled={isGeneratingDocx}
                rows={3}
                placeholder="Ex. : Mettre en avant notre présence cynophile de nuit ; insister sur la réactivité de l'encadrement le week-end…"
                className="w-full rounded-[9px] border border-input bg-card px-3 py-2.5 text-sm leading-relaxed focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="document-complementaire" className={cn("inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-semibold shadow-o1 transition-[background-color,border-color,scale] duration-150 hover:border-[#C7D0DC] hover:bg-[#FBFCFD] active:scale-[.97]", isGeneratingDocx && "pointer-events-none opacity-50")}>
                  <FileText className="h-4 w-4" />
                  {documentComplementaire ? "Changer de document" : "Joindre un document"}
                </label>
                <input
                  id="document-complementaire"
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md"
                  className="hidden"
                  disabled={isGeneratingDocx}
                  onChange={(e) => { setDocumentComplementaire(e.target.files?.[0] || null); e.target.value = ""; }}
                />
                {documentComplementaire ? (
                  <span className="flex animate-monter items-center gap-2 rounded-full bg-info-soft px-3 py-1 text-[12.5px] font-medium text-info">
                    {documentComplementaire.name}
                    <button type="button" className="font-semibold text-muted-foreground underline-offset-2 hover:text-destructive hover:underline" onClick={() => setDocumentComplementaire(null)} disabled={isGeneratingDocx}>Retirer</button>
                  </span>
                ) : (
                  <span className="font-mono text-[11.5px] text-subtle-foreground">PDF, Word ou texte</span>
                )}
              </div>
            </div>

            <div className="mt-6">
              <Button
                size="lg"
                onClick={handleGenerateFullDocx}
                disabled={isGeneratingDocx || !canGenerate}
                className={cn(
                  "h-12 w-full max-w-md text-[15px]",
                  canGenerate ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "bg-secondary text-muted-foreground shadow-none cursor-not-allowed"
                )}
              >
                {isGeneratingDocx ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileStack className="mr-2 h-5 w-5" />}
                {isGeneratingDocx ? "Génération en cours..." : "Lancer la génération du document"}
              </Button>
              {!isPrerequisOk && <p className="mt-2 text-xs text-warning">Prérequis manquants (CR Visite)</p>}
              {isPrerequisOk && questionsRestantes > 0 && (
                <div className="mx-auto mt-4 max-w-2xl animate-monter rounded-xl border border-[#F0D3A8] bg-gradient-to-r from-warning-soft to-[#FFFBF3] px-4 py-3.5 text-left text-[13px] text-warning">
                  <p className="font-semibold leading-relaxed">
                    Génération bloquée : {questionsRestantes} information{questionsRestantes > 1 ? "s" : ""} manquante{questionsRestantes > 1 ? "s" : ""} sans réponse
                    {" "}(sur {nbManques} détectée{nbManques > 1 ? "s" : ""}).
                  </p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    Obtenez les réponses (équipe / recherche web) avant de générer.
                  </p>
                  {!bypassActive && (
                    <div className="mt-3.5">
                      <Button variant="outline" size="sm" onClick={() => setShowBypassModal(true)} className="border-[#F0D3A8] text-warning hover:border-warning/60 hover:bg-warning-soft">
                        Ignorer et forcer la génération
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Listing complet des infos manquantes détectées (toujours visible si des missingFields existent) */}
              {(() => {
                const allMissing: Array<{ id: string; label: string; context?: string; criticite?: string; demande?: string }> = Array.isArray(dossierInfo?.memoire_cadre_state?.missingFields) ? dossierInfo.memoire_cadre_state.missingFields : [];
                const unresolvedIds = new Set((gate?.unresolved ?? []).map((u: { id: string }) => u.id));
                if (allMissing.length === 0) return null;
                return (
                  <div className="mx-auto mt-5 w-full max-w-2xl text-left">
                    <h3 className="mb-2 text-[13.5px] font-semibold text-foreground">
                      Exigences détectées ({allMissing.length})
                    </h3>
                    <ul className="apparait grid gap-2">
                      {allMissing.map((m) => {
                        const resolved = !unresolvedIds.has(m.id);
                        return (
                          <li
                            key={m.id}
                            className={cn(
                              "rounded-[9px] border px-3.5 py-2.5 text-sm transition-colors duration-150 hover:border-[#C9D3DF]",
                              resolved
                                ? "border-[#CDE7D9] bg-success-soft opacity-80"
                                : m.criticite === "bloquant"
                                  ? "border-[#F2C3C8] border-l-4 border-l-destructive bg-[#FFF9F9]"
                                  : "border-[#F0D3A8] bg-[#FFFBF3]",
                            )}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex min-w-0 items-start gap-2">
                                {resolved && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
                                <span className={cn("min-w-0 font-semibold", resolved && "line-through")}>{m.label}</span>
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                {m.criticite === "bloquant" && !resolved && <Badge variant="destructive">Bloquant</Badge>}
                                {m.criticite === "facultatif" && <Badge variant="outline">Facultatif</Badge>}
                                {m.demande === "web" ? (
                                  <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" /> Web</Badge>
                                ) : m.demande === "equipe" ? (
                                  <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> Équipe</Badge>
                                ) : null}
                              </div>
                            </div>
                            {m.context && (
                              <div className="mt-1 flex items-start gap-1.5 text-[12.5px] italic text-muted-foreground">
                                <FileText aria-hidden="true" className="mt-[3px] h-3 w-3 shrink-0" />
                                <span className="min-w-0">{m.context}</span>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" className="gap-2" disabled={isSearching} onClick={handleFindOnInternet}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  {isSearching ? "Recherche en cours..." : "Trouver l'info sur internet"}
                </Button>
                <Button variant="outline" className="gap-2" disabled={isAskingTeam} onClick={handleAskTeam}>
                  {isAskingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  {isAskingTeam ? "Envoi en cours..." : "Demander \u00e0 l'\u00e9quipe"}
                </Button>
              </div>
              {searchError && <p className="mx-auto mt-3 max-w-2xl animate-monter rounded-lg bg-destructive-soft px-3 py-2 text-[12.5px] font-medium text-destructive">{searchError}</p>}
              {searchNotice && <p className="mx-auto mt-3 max-w-2xl animate-monter rounded-lg bg-info-soft px-3 py-2 text-[12.5px] text-info">{searchNotice}</p>}
              {askTeamError && <p className="mx-auto mt-3 max-w-2xl animate-monter rounded-lg bg-destructive-soft px-3 py-2 text-[12.5px] font-medium text-destructive">{askTeamError}</p>}
              {askTeamNotice && <p className="mx-auto mt-3 max-w-2xl animate-monter whitespace-pre-line rounded-lg border border-border bg-secondary/60 px-3.5 py-2.5 text-left font-mono text-[12px] leading-relaxed text-muted-foreground">{askTeamNotice}</p>}
            </div>

            {isGeneratingDocx && progressInfo && (
              <div className="mt-8 mx-auto w-full max-w-md animate-monter text-left space-y-3.5 rounded-xl border border-border bg-[#FAFBFD] p-5 shadow-o1">
                <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                  <span className="text-primary flex min-w-0 items-center gap-2">
                    <PointActif />
                    {progressInfo.progress < 100 && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {progressInfo.message}
                  </span>
                  <span className="chiffre-cle text-[22px] text-foreground">{progressInfo.progress}%</span>
                </div>
                <Progress value={progressInfo.progress} className="h-2 w-full" indicatorClassName="reflet-actif bg-gradient-to-r from-primary to-[#2F5E9E]" />

              </div>
            )}
          </div>

          {docxResult && docxResult.type === "success" && (
            <Card className="mt-8 animate-monter overflow-hidden border-[#BFE0CC]">
              <div className="bg-gradient-to-r from-success-soft to-card px-4 py-4 border-b border-[#CFE8D9] flex flex-wrap items-center justify-between gap-3 md:px-6">
                <div className="flex items-center gap-2.5 text-success font-semibold">
                  <CheckCircle2 className="h-6 w-6 motion-safe:animate-zoom-doux" />
                  <span>Document généré avec succès !</span>
                </div>
                <Link href={`/dossiers/${id}/export`}>
                  <Button variant="default" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    Continuer vers l'Export <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {/* Listing des infos manquantes retiré ici : il est fait APRÈS l'analyse de l'upload
                  (fiche dossier), pour les DEUX cas (cadre imposé basé template, sans cadre basé exigences). */}

              <div className="p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-foreground">Aperçu :</h3>
                </div>
                {hasTemplate ? (
                  <div className="space-y-4">
                    {JSON.parse(docxResult.data.data_generee_par_ia?.details || "[]").map((mod: any, idx: number) => (
                      <div key={idx} className="grid gap-4 rounded-xl border border-border p-4 bg-card md:grid-cols-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Texte original (Recherche)</div>
                          <div className="bg-destructive/5 text-destructive px-3 py-2 rounded text-sm font-mono border border-destructive/20 whitespace-pre-wrap break-all line-through opacity-70">
                            {mod.recherche}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Proposition IA (Remplacement)</div>
                          <div className="bg-success/5 text-success px-3 py-2 rounded text-sm font-mono border border-success/20 whitespace-pre-wrap break-all">
                            {mod.remplacement}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    La synthèse a été ajoutée.{docxResult.data.data_generee_par_ia?.mode ? ` Mode: ${docxResult.data.data_generee_par_ia.mode}` : ""}
                  </div>
                )}

                {/* Prévisualisation Complète du DOCX ou PDF (remplacée par le panneau de complétion
                    ci-dessous quand il est disponible) */}
                {!completionDispo && (
                <div className="mt-12 pt-8 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-lg text-foreground">Aperçu du document final (De A à Z)</h3>
                    <a href={`${apiBase}/api/download?file=${encodeURIComponent(docxResult.data.file_path)}&download=1`} download className="inline-flex items-center justify-center rounded-[9px] text-sm font-semibold shadow-o1 transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 border border-border bg-card hover:border-[#C7D0DC] hover:bg-[#FBFCFD] h-9 px-4 py-2">
                      <Download className="mr-2 h-4 w-4" />
                      Télécharger
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Voici le rendu interactif du fichier tel qu'il a été généré, avec le formatage d'origine conservé.</p>
                  
                  {docxResult.data?.file_path?.toLowerCase()?.endsWith('.pdf') ? (
                    <div className="relative w-full rounded-xl border border-border bg-secondary mt-6 shadow-inner h-[800px] overflow-hidden">
                      <iframe 
                        src={`${apiBase}/api/download?file=${encodeURIComponent(docxResult.data?.file_path || '')}`}
                        className="w-full h-full rounded-md"
                        title="Prévisualisation PDF"
                      />
                    </div>
                  ) : (
                    <DocxPreviewViewer fileUrl={`${apiBase}/api/download?file=${encodeURIComponent(docxResult.data?.file_path || '')}`} />
                  )}
                </div>
                )}
              </div>
            </Card>
          )}

          {completionDispo && !isGeneratingDocx && (
            <div className="relative left-1/2 w-[min(1280px,calc(100vw-64px-2.5rem))] -translate-x-1/2 md:w-[min(1280px,calc(100vw-248px-5rem))]">
              <CompletionPanel
                key={docxResult?.data?.file_path || "dernier"}
                dossierId={id}
                onAbsent={() => setCompletionDispo(false)}
              />
            </div>
          )}

          {docxResult && docxResult.type === "error" && (
            <div className="mt-8 animate-monter p-4 bg-gradient-to-r from-destructive-soft to-[#FFF8F8] text-destructive rounded-xl border border-[#F2C3C8]">
              <strong>Erreur lors de la génération :</strong> {docxResult.message}
            </div>
          )}
        </div>
      </EntreeEtape>

      {showBypassModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(11,37,69,.45)] backdrop-blur-[4px] p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-o3 border border-border overflow-hidden m-auto animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300">
            <div className="p-6">
              <div className="flex items-center gap-3 text-warning mb-4 [&>svg]:box-content [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 [&>svg]:rounded-full [&>svg]:bg-warning-soft [&>svg]:p-2.5">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="font-display text-[20px] font-bold leading-tight">Attention : Informations manquantes</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Vous êtes sur le point de forcer la génération du mémoire alors qu'il manque encore <strong className="text-foreground">{questionsRestantes} information(s) requise(s)</strong>.
                L'IA risque de laisser des trous [À COMPLÉTER] ou d'être imprécise sur ces points.
              </p>
              <p className="text-sm font-semibold text-foreground mb-6">
                Êtes-vous sûr de vouloir continuer ?
              </p>
              <div className="flex items-center justify-end gap-3">
                <Button variant="outline" onClick={() => setShowBypassModal(false)}>
                  Annuler
                </Button>
                <Button 
                  className="bg-warning hover:bg-warning/90 hover:shadow-o2 text-warning-foreground"
                  onClick={() => {
                    setShowBypassModal(false);
                    setBypassActive(true);
                  }}
                >
                  Confirmer et débloquer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
