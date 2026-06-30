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

  // States for Prerequisite System (Required System)
  const [crFourni, setCrFourni] = useState(false);
  const isPrerequisOk = true; // CR requirement temporarily disabled

  const [dossierInfo, setDossierInfo] = useState<any>({ acheteur: "Chargement...", reference: "..." });
  const [hasTemplate, setHasTemplate] = useState(false);
  const [selectedSlidesCount, setSelectedSlidesCount] = useState<number>(0);

  // Progress polling state
  const [progressInfo, setProgressInfo] = useState<{
    status: string;
    progress: number;
    message: string;
    logs: string[];
  } | null>(null);

  useEffect(() => {
    fetch(`http://localhost:8000/api/dossiers/${id}`)
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
        const res = await fetch(`http://localhost:8000/api/dossiers/${id}/progress`);
        if (res.ok) {
          const data = await res.json();
          setProgressInfo(data);
        }
      } catch (e) {
        console.error("Error polling progress:", e);
      }
    }, 1000);

    try {
      const res = await fetch(`http://localhost:8000/api/dce/${id}/memoire`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la génération");
      
      if (data.status === 'incomplete') {
        setDocxResult({ type: 'incomplete', missingFields: data.missingFields });
      } else {
        setDocxResult({ type: "success", data });
        localStorage.setItem(`generated_docx_${id}`, data.file_path);
      }
    } catch (e: any) {
      setDocxResult({ type: "error", message: e.message });
    } finally {
      clearInterval(interval);
      setIsGeneratingDocx(false);
    }
  }

  const [missingAnswers, setMissingAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [chatInputValue, setChatInputValue] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'bot' | 'user', text: string, context?: string }>>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    async function initChat() {
      if (docxResult && docxResult.type === 'incomplete' && chatMessages.length === 0 && docxResult.missingFields?.length > 0) {
        const firstField = docxResult.missingFields[0];
        setIsChatLoading(true);
        try {
          const res = await fetch(`http://localhost:8000/api/dce/${id}/memoire/chat-missing-eval`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ context: firstField.context, chatHistory: [] })
          });
          const data = await res.json();
          setChatMessages([
            { sender: 'bot', text: `L'IA a terminé l'analyse du DCE, mais n'a pas pu identifier certaines informations de manière certaine. Je vais vous poser ${docxResult.missingFields.length} question(s) rapide(s).` },
            { sender: 'bot', text: data.bot_reply }
          ]);
        } catch (e) {
          setChatMessages([
            { sender: 'bot', text: "Erreur d'initialisation du chatbot." }
          ]);
        } finally {
          setIsChatLoading(false);
          setCurrentQuestionIndex(0);
        }
      }
    }
    initChat();
  }, [docxResult]);

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInputValue.trim() || isChatLoading) return;

    const userMessage = chatInputValue;
    setChatInputValue('');

    const historyForApi = chatMessages.slice(1).map(m => ({
      role: m.sender === 'bot' ? 'assistant' : 'user',
      content: m.text
    }));

    const newMessages = [...chatMessages, { sender: 'user', text: userMessage }];
    setChatMessages([...newMessages]);
    
    setIsChatLoading(true);
    try {
      const currentField = docxResult.missingFields[currentQuestionIndex];
      const historyWithUser = [...historyForApi, { role: 'user', content: userMessage }];
      
      const res = await fetch(`http://localhost:8000/api/dce/${id}/memoire/chat-missing-eval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: currentField.context, chatHistory: historyWithUser })
      });
      const data = await res.json();
      
      if (data.status === 'accepted') {
        const newAnswers = { ...missingAnswers, [currentField.id]: data.extracted_value };
        setMissingAnswers(newAnswers);
        
        newMessages.push({ sender: 'bot', text: data.bot_reply });
        
        const nextIndex = currentQuestionIndex + 1;
        if (nextIndex < docxResult.missingFields.length) {
          const nextField = docxResult.missingFields[nextIndex];
          const nextRes = await fetch(`http://localhost:8000/api/dce/${id}/memoire/chat-missing-eval`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ context: nextField.context, chatHistory: [] })
          });
          const nextData = await nextRes.json();
          newMessages.push({ sender: 'bot', text: `(Question ${nextIndex + 1}/${docxResult.missingFields.length}) ` + nextData.bot_reply });
          setChatMessages([...newMessages]);
          setCurrentQuestionIndex(nextIndex);
        } else {
          newMessages.push({ sender: 'bot', text: "Merci ! Toutes les informations sont complètes. Je finalise le document..." });
          setChatMessages([...newMessages]);
          setCurrentQuestionIndex(nextIndex);
          handleSubmitMissingInfo(newAnswers);
        }
      } else {
        newMessages.push({ sender: 'bot', text: data.bot_reply });
        setChatMessages([...newMessages]);
      }
    } catch (e) {
      newMessages.push({ sender: 'bot', text: "Une erreur est survenue lors de l'évaluation. Réessayez." });
      setChatMessages([...newMessages]);
    } finally {
      setIsChatLoading(false);
    }
  }

  async function handleSubmitMissingInfo(answersToSubmit = missingAnswers) {
    setIsGeneratingDocx(true);
    setProgressInfo({ status: 'idle', progress: 95, message: 'Finalisation...', logs: [] });
    try {
      const res = await fetch(`http://localhost:8000/api/dce/${id}/memoire/fill-missing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAnswers: answersToSubmit })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la finalisation");
      setDocxResult({ type: "success", data });
      localStorage.setItem(`generated_docx_${id}`, data.file_path);
    } catch (e: any) {
      setDocxResult({ type: "error", message: e.message });
    } finally {
      setIsGeneratingDocx(false);
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
                disabled={isGeneratingDocx || !isPrerequisOk}
                className={cn(
                  "w-full max-w-md transition-all",
                  isPrerequisOk ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                {isGeneratingDocx ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileStack className="mr-2 h-5 w-5" />}
                {isGeneratingDocx ? "Génération en cours..." : "Lancer la génération du document"}
              </Button>
              {!isPrerequisOk && <p className="mt-2 text-xs text-warning">Prérequis manquants (CR Visite)</p>}

              <div className="mt-4 flex items-center justify-center gap-3">
                <Button variant="outline" className="gap-2" onClick={() => {}}>
                  <Globe className="h-4 w-4" />
                  Trouver l&apos;info sur internet
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => {}}>
                  <Users className="h-4 w-4" />
                  Demander à l&apos;équipe
                </Button>
              </div>
            </div>

            {progressInfo && (isGeneratingDocx || progressInfo.progress < 100) && (
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

          {docxResult && docxResult.type === "incomplete" && (
            <Card className="mt-8 overflow-hidden border-warning/30">
              <div className="bg-warning/10 px-6 py-4 border-b border-warning/20 flex items-center justify-between">
                <div className="flex items-center gap-2 text-warning font-semibold">
                  <AlertTriangle className="h-5 w-5" />
                  <span>Assistant : Informations manquantes</span>
                </div>
              </div>
              <div className="p-0">
                <div className="h-[400px] overflow-y-auto p-6 space-y-4 bg-muted/30 flex flex-col">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-xl p-3 text-sm ${msg.sender === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-card border border-border text-foreground rounded-bl-none shadow-sm'}`}>
                        {msg.text}
                        {msg.context && (
                          <div className="mt-2 p-2 bg-muted border border-border/50 rounded text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                            {msg.context}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-card border border-border text-foreground rounded-xl rounded-bl-none shadow-sm p-3 flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        L'IA réfléchit...
                      </div>
                    </div>
                  )}
                  {isGeneratingDocx && currentQuestionIndex >= docxResult.missingFields?.length && (
                    <div className="flex justify-start">
                      <div className="bg-card border border-border text-foreground rounded-xl rounded-bl-none shadow-sm p-3 flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Génération du Word en cours...
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-card border-t border-border/50">
                  <form onSubmit={handleChatSubmit} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Votre réponse..."
                      className="flex-1 px-4 py-2 border border-input rounded-full text-sm focus-visible:ring-2 focus-visible:ring-ring outline-none transition-all bg-background text-foreground"
                      value={chatInputValue}
                      onChange={e => setChatInputValue(e.target.value)}
                      disabled={isChatLoading || isGeneratingDocx || currentQuestionIndex >= docxResult.missingFields?.length}
                      autoFocus
                    />
                    <Button 
                      type="submit"
                      disabled={!chatInputValue.trim() || isChatLoading || isGeneratingDocx || currentQuestionIndex >= docxResult.missingFields?.length}
                      className="rounded-full px-6 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Envoyer
                    </Button>
                  </form>
                </div>
              </div>
            </Card>
          )}

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
                    <a href={`http://localhost:8000/api/download?file=${encodeURIComponent(docxResult.data.file_path)}&download=1`} download className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-border bg-card hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                      <Download className="mr-2 h-4 w-4" />
                      Télécharger
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Voici le rendu interactif du fichier tel qu'il a été généré, avec le formatage d'origine conservé.</p>
                  
                  {docxResult.data.file_path.toLowerCase().endsWith('.pdf') ? (
                    <div className="relative w-full rounded-md border border-border bg-muted mt-6 shadow-inner h-[800px]">
                      <iframe 
                        src={`http://localhost:8000/api/download?file=${encodeURIComponent(docxResult.data.file_path)}`}
                        className="w-full h-full rounded-md"
                        title="Prévisualisation PDF"
                      />
                    </div>
                  ) : (
                    <DocxPreviewViewer fileUrl={`http://localhost:8000/api/download?file=${encodeURIComponent(docxResult.data.file_path)}`} />
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
