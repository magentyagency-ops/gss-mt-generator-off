"use client";

import { useEffect, useMemo, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { use } from "react";

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
  // Change à chaque génération → force le badge crédits à se recharger.
  const [creditKey, setCreditKey] = useState(0);

  // States for Prerequisite System (Required System)
  const [crFourni, setCrFourni] = useState(false);
  const isPrerequisOk = true; // CR requirement temporarily disabled

  // Blocage de la génération tant que les questions détectées ne sont pas RÉSOLUES.
  // On bloque dès qu'il RESTE des manques sans réponse — même si aucune sollicitation n'a encore
  // été envoyée. Résolu = réponse d'équipe reçue/validée OU recherche web validée.
  const supabaseCli = useMemo(() => createClient(), []);
  const [resolus, setResolus] = useState(0);

  const loadResolus = async () => {
    let answered = 0;
    let webValides = 0;
    try {
      const { data } = await supabaseCli
        .from("question_interne")
        .select("id")
        .eq("ao_id", id)
        .in("statut", ["reponse_recue", "validee"]);
      answered = Array.isArray(data) ? data.length : 0;
    } catch { answered = 0; }
    try {
      const { data } = await supabaseCli
        .from("recherche_web")
        .select("id")
        .eq("dossier_id", id)
        .eq("statut", "validee");
      webValides = Array.isArray(data) ? data.length : 0;
    } catch { webValides = 0; }
    setResolus(answered + webValides);
  };

  useEffect(() => { loadResolus(); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const [dossierInfo, setDossierInfo] = useState<any>({ acheteur: "Chargement...", reference: "..." });
  const [hasTemplate, setHasTemplate] = useState(false);
  const [selectedSlidesCount, setSelectedSlidesCount] = useState<number>(0);

  // Nombre de manques détectés (persistés à l'analyse du DCE) et blocage de la génération tant
  // qu'il RESTE des questions sans réponse (même sans sollicitation encore envoyée).
  const nbManques = Array.isArray(dossierInfo?.memoire_cadre_state?.missingFields)
    ? dossierInfo.memoire_cadre_state.missingFields.length : 0;
  const questionsRestantes = Math.max(0, nbManques - resolus);
  const canGenerate = isPrerequisOk && questionsRestantes === 0;

  // Progress polling state
  const [progressInfo, setProgressInfo] = useState<{
    status: string;
    progress: number;
    message: string;
    logs: string[];
  } | null>(null);

  useEffect(() => {
    apiFetch(`/api/dossiers/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) setDossierInfo(data);
      })
      .catch(e => console.error(e));
  }, [id]);

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

    // Start progress polling
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/dossiers/${id}/progress`);
        if (res.ok) {
          const data = await res.json();
          setProgressInfo(data);
        }
      } catch (e) {
        console.error("Error polling progress:", e);
      }
    }, 1000);

    try {
      const res = await apiFetch(`/api/dce/${id}/memoire`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la génération");

      setDocxResult({ type: "success", data });
      setCreditKey((k) => k + 1); // recharge le badge crédits
      if (data.file_path) localStorage.setItem(`generated_docx_${id}`, data.file_path);
    } catch (e: any) {
      setDocxResult({ type: "error", message: e.message });
    } finally {
      clearInterval(interval);
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
      loadResolus();   // rafraîchit le nombre de réponses obtenues
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {dossierInfo.acheteur} · {dossierInfo.reference}
            </div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              Mémoire technique — génération IA
              {hasTemplate ? (
                <Badge variant="default">Cadre imposé</Badge>
              ) : (
                <Badge variant="warning">Réponse libre (AO RNE)</Badge>
              )}
            </h1>
          </div>
          <CreditsBadge key={creditKey} />
        </div>
      </header>

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

      <div className="flex flex-1 flex-col items-center justify-start overflow-y-auto bg-muted/10 p-8">
        <div className="w-full max-w-4xl space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">
              {hasTemplate ? "Génération par Template" : "Génération Automatique (AO RNE)"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {hasTemplate 
                ? "Ce dossier contient un cadre de réponse imposé par le marché. L'IA lit le document complet pour y insérer directement les éléments adaptés (cocher des cases, remplir des champs spécifiques)."
                : `Aucun cadre de réponse n'est imposé. Le système va assembler un mémoire sur-mesure à partir des ${selectedSlidesCount > 0 ? selectedSlidesCount : "plusieurs"} slides pré-sélectionnées et y intégrer une synthèse personnalisée basée sur l'analyse du DCE, en gardant la charte graphique GSS intacte.`}
            </p>

            <div className="mt-6">
              <Button
                size="lg"
                onClick={handleGenerateFullDocx}
                disabled={isGeneratingDocx || !canGenerate}
                className={cn(
                  "w-full max-w-md transition-all",
                  canGenerate ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                {isGeneratingDocx ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileStack className="mr-2 h-5 w-5" />}
                {isGeneratingDocx ? "Génération en cours..." : "Lancer la génération du document"}
              </Button>
              {!isPrerequisOk && <p className="mt-2 text-xs text-warning">Prérequis manquants (CR Visite)</p>}
              {isPrerequisOk && questionsRestantes > 0 && (
                <p className="mt-2 text-xs text-warning">
                  Génération bloquée : {questionsRestantes} question{questionsRestantes > 1 ? "s" : ""} sans réponse
                  {" "}(sur {nbManques} détectée{nbManques > 1 ? "s" : ""}). Obtenez les réponses (équipe / recherche web) avant de générer.
                </p>
              )}

              <div className="mt-4 flex items-center justify-center gap-3">
                <Button variant="outline" className="gap-2" disabled={isSearching} onClick={handleFindOnInternet}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  {isSearching ? "Recherche en cours..." : "Trouver l'info sur internet"}
                </Button>
                <Button variant="outline" className="gap-2" disabled={isAskingTeam} onClick={handleAskTeam}>
                  {isAskingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  {isAskingTeam ? "Envoi en cours..." : "Demander \u00e0 l'\u00e9quipe"}
                </Button>
              </div>
              {searchError && <p className="mt-2 text-xs text-destructive">{searchError}</p>}
              {searchNotice && <p className="mt-2 text-xs text-muted-foreground">{searchNotice}</p>}
              {askTeamError && <p className="mt-2 text-xs text-destructive">{askTeamError}</p>}
              {askTeamNotice && <p className="mt-2 whitespace-pre-line text-left text-xs text-muted-foreground">{askTeamNotice}</p>}
            </div>

            {isGeneratingDocx && progressInfo && (
              <div className="mt-8 mx-auto w-full max-w-md text-left space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-primary flex items-center gap-1.5">
                    {progressInfo.progress < 100 && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {progressInfo.message}
                  </span>
                  <span className="tabular-nums">{progressInfo.progress}%</span>
                </div>
                <Progress value={progressInfo.progress} className="h-2 w-full" />

              </div>
            )}
          </div>

          {docxResult && docxResult.type === "success" && (
            <Card className="mt-8 overflow-hidden border-success/30">
              <div className="bg-success/5 px-6 py-4 border-b border-success/20 flex items-center justify-between">
                <div className="flex items-center gap-2 text-success font-semibold">
                  <CheckCircle2 className="h-5 w-5" />
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

              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-foreground">Aperçu :</h3>
                </div>
                {hasTemplate ? (
                  <div className="space-y-4">
                    {JSON.parse(docxResult.data.data_generee_par_ia?.details || "[]").map((mod: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-card">
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
                    La synthèse a été ajoutée. Mode: {docxResult.data.data_generee_par_ia?.mode}
                  </div>
                )}

                {/* Prévisualisation Complète du DOCX ou PDF */}
                <div className="mt-12 pt-8 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-lg text-foreground">Aperçu du document final (De A à Z)</h3>
                    <a href={`${apiBase}/api/download?file=${encodeURIComponent(docxResult.data.file_path)}&download=1`} download className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-border bg-card hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                      <Download className="mr-2 h-4 w-4" />
                      Télécharger
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Voici le rendu interactif du fichier tel qu'il a été généré, avec le formatage d'origine conservé.</p>
                  
                  {docxResult.data.file_path.toLowerCase().endsWith('.pdf') ? (
                    <div className="relative w-full rounded-md border border-border bg-muted mt-6 shadow-inner h-[800px]">
                      <iframe 
                        src={`${apiBase}/api/download?file=${encodeURIComponent(docxResult.data.file_path)}`}
                        className="w-full h-full rounded-md"
                        title="Prévisualisation PDF"
                      />
                    </div>
                  ) : (
                    <DocxPreviewViewer fileUrl={`${apiBase}/api/download?file=${encodeURIComponent(docxResult.data.file_path)}`} />
                  )}
                </div>
              </div>
            </Card>
          )}

          {docxResult && docxResult.type === "error" && (
            <div className="mt-8 p-4 bg-destructive/10 text-destructive rounded-md border border-destructive/30">
              <strong>Erreur lors de la génération :</strong> {docxResult.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
