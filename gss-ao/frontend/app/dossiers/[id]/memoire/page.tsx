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
} from "lucide-react";
import { Badge, Button, Card, Progress } from "@/components/ui";
import { DossierNav } from "@/components/dossier-nav";
import { type DceFile } from "@/lib/gss-config";
import { AI_SECTIONS, CHAPTER_TITLES } from "@/lib/ai/sections";
import { DocxPreviewViewer } from "@/components/docx-preview-viewer";
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
    } catch {
      /* ignore */
    }
  }, []);



  async function handleGenerateFullDocx() {
    setIsGeneratingDocx(true);
    setDocxResult(null);
    try {
      const res = await fetch(`http://localhost:8000/api/dce/${id}/memoire`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la génération");
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
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800">Prérequis manquants pour générer le document</h3>
              <p className="text-sm text-amber-700 mt-1">L'IA ne peut pas générer un mémoire pertinent si les informations terrain sont manquantes. Ce dossier exige une visite obligatoire.</p>
              <ul className="mt-3 space-y-2 text-sm text-amber-800">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Analyse du DCE (CCTP & RC)</li>
                <li className="flex items-center gap-2">
                  {crFourni ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-amber-500" />}
                  Compte Rendu de Visite de Sacha
                  {!crFourni && (
                    <Button variant="outline" size="sm" className="ml-3 h-7 bg-white text-xs" onClick={() => setCrFourni(true)}>
                      Simuler l'ajout du CR
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
                : "Aucun cadre de réponse n'est imposé. Le système va personnaliser la couverture de l'AO RNE (119 pages) et y ajouter une synthèse sur-mesure basée sur l'analyse du DCE et la documentation GSS, en gardant la mise en page intacte."}
            </p>

            <div className="mt-6">
              <Button
                size="lg"
                onClick={handleGenerateFullDocx}
                disabled={isGeneratingDocx || !isPrerequisOk}
                className={cn(
                  "w-full max-w-md transition-all",
                  isPrerequisOk ? "bg-indigo-600 hover:bg-indigo-700" : "bg-indigo-300 cursor-not-allowed"
                )}
              >
                {isGeneratingDocx ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileStack className="mr-2 h-5 w-5" />}
                {isGeneratingDocx ? "Génération en cours..." : "Lancer la génération du document"}
              </Button>
              {!isPrerequisOk && <p className="mt-2 text-xs text-amber-600">Prérequis manquants (CR Visite)</p>}
            </div>
          </div>

          {docxResult && docxResult.type === "success" && (
            <Card className="mt-8 overflow-hidden border-emerald-200">
              <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Document généré avec succès !</span>
                </div>
                <Link href={`/dossiers/${id}/export`}>
                  <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
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
                          <div className="bg-red-50 text-red-900 px-3 py-2 rounded text-sm font-mono border border-red-100 whitespace-pre-wrap break-all line-through opacity-70">
                            {mod.recherche}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Proposition IA (Remplacement)</div>
                          <div className="bg-emerald-50 text-emerald-900 px-3 py-2 rounded text-sm font-mono border border-emerald-100 whitespace-pre-wrap break-all">
                            {mod.remplacement}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    La synthèse a été ajoutée. Mode: {docxResult.data.data_generee_par_ia?.mode}
                  </div>
                )}

                {/* Prévisualisation Complète du DOCX */}
                <div className="mt-12 pt-8 border-t border-slate-200">
                  <h3 className="font-medium text-lg text-slate-800 mb-2">Aperçu du document final (De A à Z)</h3>
                  <p className="text-sm text-slate-500 mb-4">Voici le rendu interactif du fichier DOCX tel qu'il a été généré, avec le formatage d'origine conservé.</p>
                  <DocxPreviewViewer fileUrl={`http://localhost:8000/api/download?file=${encodeURIComponent(docxResult.data.file_path)}`} />
                </div>
              </div>
            </Card>
          )}

          {docxResult && docxResult.type === "error" && (
            <div className="mt-8 p-4 bg-red-50 text-red-800 rounded-md border border-red-200">
              <strong>Erreur lors de la génération :</strong> {docxResult.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
