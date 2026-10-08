"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Search,
  Loader2,
  ArrowRight,
  AlertTriangle,
  FileStack,
  Square,
  SquareCheck,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { DossierNav } from "@/components/dossier-nav";
import { apiFetch } from "@/lib/api";

import { analyzeSlides, getApiKey, type SlideRec } from "@/lib/ai/client";
import {
  getAnalyzedSlides,
  setAnalyzedSlides,
  getSelectedIndexes,
  setSelectedIndexes,
} from "@/lib/ai/mode";
import { CHAPTER_TITLES_B } from "@/lib/ai/sections-b";
import { cn } from "@/lib/utils";
import { BandeauDossier } from "@/components/visuel/bandeau-dossier";
import { EntreeEtape } from "@/components/visuel/entree-etape";
import { IndicateurGlissant } from "@/components/visuel/indicateur-glissant";

const CHAPTERS = ["all", "I", "II", "III", "IV"] as const;
type ChapFilter = (typeof CHAPTERS)[number];
const TOTAL_SLIDES = 118;

const RECO_BADGE: Record<SlideRec["recommendation"], { label: string; variant: "success" | "warning" | "secondary" }> = {
  keep: { label: "Conservée", variant: "success" },
  modify: { label: "À personnaliser", variant: "warning" },
  discard: { label: "Exclue", variant: "secondary" },
};

export default function SelectionSlidesPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [slides, setSlides] = useState<SlideRec[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chap, setChap] = useState<ChapFilter>("all");
  const [query, setQuery] = useState("");
  const [hasKey, setHasKey] = useState(true);

  const [dossierInfo, setDossierInfo] = useState<any>({ acheteur: "Chargement...", reference: "..." });

  useEffect(() => {
    apiFetch(`/api/dossiers/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) setDossierInfo(data);
      })
      .catch(e => console.error(e));

    setHasKey(!!getApiKey());
    setSlides(getAnalyzedSlides(id));
    setSelected(getSelectedIndexes(id));
  }, [id]);

  async function runAnalysis() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await analyzeSlides({
        cctpExtract:
          "Prestations de sécurité-sûreté sur 6 campus de l'Université de Rouen Normandie (76 et 27), reprise du personnel, chef d'équipe SSIAP2, télésurveillance lot 3.",
        proposalStrengths: [
          "Reprise du personnel garantie (L1224-1)",
          "Encadrement SSIAP2 dédié",
          "Main courante électronique Track Force",
        ],
        siteContext: "Université de Rouen Normandie — 6 campus, ZRR, rondes et télésurveillance.",
      });
      setSlides(r.slides);
      setAnalyzedSlides(id, r.slides);
      const pre = r.slides
        .filter((s) => s.recommendation === "keep" || s.recommendation === "modify")
        .map((s) => s.index);
      setSelected(pre);
      setSelectedIndexes(id, pre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse échouée");
    } finally {
      setBusy(false);
    }
  }

  function toggle(index: number) {
    const next = selected.includes(index)
      ? selected.filter((i) => i !== index)
      : [...selected, index];
    setSelected(next);
    setSelectedIndexes(id, next);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: slides.length, I: 0, II: 0, III: 0, IV: 0 };
    slides.forEach((s) => (c[s.chapter] = (c[s.chapter] || 0) + 1));
    return c;
  }, [slides]);

  const recommended = slides.filter(
    (s) => s.recommendation === "keep" || s.recommendation === "modify",
  ).length;

  const visible = slides.filter((s) => {
    if (chap !== "all" && s.chapter !== chap) return false;
    if (query) {
      const q = query.toLowerCase();
      return s.file_name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <BandeauDossier className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-5 md:pb-5 md:pt-5 animate-apparaitre">
        <div>
          <div className="font-mono text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
            {dossierInfo.acheteur}{dossierInfo.reference ? ` · ${dossierInfo.reference}` : ""} · Mode réponse libre
          </div>
          <h1 className="mt-1.5 font-display text-[24px] font-bold leading-[1.15] md:text-[28px]">Sélection des slides GSS</h1>
        </div>
        <Link href={`/dossiers/${id}/memoire`}>
          <Button disabled={selected.length === 0}>
            Valider la sélection ({selected.length}) <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </BandeauDossier>

      <DossierNav id={id} />

      <EntreeEtape className="flex min-h-0 flex-1 flex-col">
      {slides.length === 0 ? (
        <div className="apparait flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-secondary ring-8 ring-secondary/50">
            <FileStack className="h-10 w-10 text-primary motion-safe:animate-flotte" strokeWidth={1.6} />
          </span>
          <div>
            <div className="font-display text-[22px] font-bold">Analyser les {TOTAL_SLIDES} slides GSS</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              L'IA recommande, pour ce marché, quelles slides de la base SLIDE REP AO conserver,
              personnaliser ou exclure (par lots de 15 pour économiser les tokens).
            </p>
          </div>
          {!hasKey && (
            <div className="flex items-center gap-2 rounded-full bg-warning-soft px-3.5 py-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4" /> Clé OpenAI requise —{" "}
              <Link href="/parametres" className="font-semibold underline underline-offset-2">
                Paramètres
              </Link>
            </div>
          )}
          <Button size="lg" onClick={runAnalysis} disabled={busy || !hasKey}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Lancer l'analyse IA des slides
          </Button>
          {error && <p className="animate-monter rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
        </div>
      ) : (
        <>
          {/* Stats + filtres */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-9">
            <div className="relative isolate flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] bg-[#E9EDF3] p-1 [scrollbar-width:none]">
              {/* Fond blanc du filtre actif, qui glisse d'un filtre à l'autre (purement visuel). */}
              <IndicateurGlissant groupe="filtres-slides" />
              {CHAPTERS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChap(c)}
                  data-actif={chap === c}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    chap === c
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c === "all" ? "Toutes" : c} ({counts[c] || 0})
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher (mot-clé, catégorie)…"
                className="h-10 w-full rounded-[9px] border border-input bg-card pl-9 pr-3 text-sm shadow-o1 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-[#FAFBFD] px-4 py-2.5 text-sm md:px-9">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{recommended}</span> slides
              recommandées sur {TOTAL_SLIDES} ·{" "}
              {chap === "all"
                ? "tous chapitres"
                : CHAPTER_TITLES_B[chap as keyof typeof CHAPTER_TITLES_B]}
            </span>
            {/* Répartition des recommandations (mêmes slides que la grille), barre décorative. */}
            <span aria-hidden="true" className="order-last flex w-full items-center gap-3 text-[11.5px] text-muted-foreground md:order-none md:w-auto">
              <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary md:w-48">
                <span className="h-full origin-left animate-remplir bg-success" style={{ flexGrow: slides.filter((x) => x.recommendation === "keep").length }} />
                <span className="h-full origin-left animate-remplir bg-[#E08A1E] [animation-delay:120ms]" style={{ flexGrow: slides.filter((x) => x.recommendation === "modify").length }} />
                <span className="h-full origin-left animate-remplir bg-[#9AA7B8] [animation-delay:240ms]" style={{ flexGrow: slides.filter((x) => x.recommendation === "discard").length }} />
              </span>
              <span className="flex shrink-0 items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />{RECO_BADGE.keep.label}</span>
              <span className="flex shrink-0 items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#E08A1E]" />{RECO_BADGE.modify.label}</span>
              <span className="flex shrink-0 items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#9AA7B8]" />{RECO_BADGE.discard.label}</span>
            </span>
            <span className="rounded-full bg-info-soft px-3 py-0.5 font-mono text-[12.5px] font-semibold tabular-nums text-info">{selected.length} sélectionnées</span>
          </div>

          {/* Grille */}
          <div className="apparait grid flex-1 grid-cols-1 content-start gap-3 overflow-y-auto px-4 py-5 sm:grid-cols-2 md:px-9 lg:grid-cols-3">
            {visible.map((s) => {
              const isSel = selected.includes(s.index);
              const reco = RECO_BADGE[s.recommendation];
              return (
                <Card
                  key={s.index}
                  onClick={() => toggle(s.index)}
                  className={cn(
                    "vive cursor-pointer select-none p-3.5",
                    isSel ? "border-primary bg-[#F6F9FD] ring-1 ring-primary" : "hover:border-[#C9D3DF]",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="font-normal">
                      {s.category}
                    </Badge>
                    {isSel ? (
                      <SquareCheck className="h-[18px] w-[18px] animate-zoom-doux text-primary" />
                    ) : (
                      <Square className="h-[18px] w-[18px] text-[#B9C5D4]" />
                    )}
                  </div>
                  <div className="truncate text-[13px] font-semibold" title={s.file_name}>
                    {s.file_name}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <Badge variant={reco.variant} className="font-normal">
                      {reco.label}
                    </Badge>
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted-foreground">Ch. {s.chapter}</span>
                  </div>
                  {s.justification && (
                    <p className="mt-2 line-clamp-2 border-t border-border pt-2 text-[11.5px] leading-relaxed text-muted-foreground" title={s.justification}>
                      💡 {s.justification}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
      </EntreeEtape>
    </div>
  );
}
