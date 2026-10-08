"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Globe,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Info,
  Clock,
  Download,
  FileDown,
  AlertTriangle,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { DossierNav } from "@/components/dossier-nav";
import { createClient } from "@/lib/supabase/client";
import { apiFetch, apiBase } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BandeauDossier } from "@/components/visuel/bandeau-dossier";
import { EntreeEtape } from "@/components/visuel/entree-etape";
import { Jauge } from "@/components/visuel/jauge";
import { SqueletteCartes } from "@/components/visuel/squelette";

/* ─────────────────────────────────────────────────────────────────────────────
 * Ticket #4 phase 2b — Recherches web (Perplexity) en attente de validation humaine.
 *
 * Cette page LISTE les recherches d'un dossier stockées « en_attente_validation » et
 * propose Valider / Rejeter. IMPORTANT : la validation NE CHANGE QUE LE STATUT — elle
 * n'injecte RIEN dans le mémoire généré (.docx), qui reste identique. Lecture + écriture
 * passent par Supabase (client navigateur) : la RLS restreint aux recherches de MES
 * dossiers et un trigger DB garantit que seul `statut` peut être modifié.
 * ───────────────────────────────────────────────────────────────────────────── */

type Statut = "en_attente_validation" | "validee" | "rejetee" | "injectee";

interface Recherche {
  id: string;
  query: string;
  answer: string | null;
  citations: string[] | null;
  model: string | null;
  cost_usd: number | null;
  statut: Statut;
  valeur_retenue: string | null;
  niveau_confiance: number | null;
  created_at: string;
}

const STATUT_BADGE: Record<Statut, { label: string; variant: "success" | "destructive" | "warning" | "secondary" }> = {
  en_attente_validation: { label: "En attente", variant: "warning" },
  validee: { label: "Validée", variant: "success" },
  rejetee: { label: "Rejetée", variant: "destructive" },
  injectee: { label: "Injectée", variant: "secondary" },
};

function SourceLinks({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="mt-3.5">
      <div className="petites-capitales mb-1.5 text-[11px]">
        Sources ({urls.length})
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {urls.map((u, i) => {
          let host = u;
          try { host = new URL(u).host.replace(/^www\./, ""); } catch { /* garde l'URL brute */ }
          return (
            <li key={`${u}-${i}`}>
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[12.5px] font-medium text-primary shadow-o1 transition-[border-color,background-color,translate] duration-150 hover:border-primary/40 hover:bg-info-soft motion-safe:hover:-translate-y-px break-all"
              >
                <Globe aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
                <span>{host}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function RecherchesPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const supabase = createClient();
  const router = useRouter();

  const [items, setItems] = useState<Recherche[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Valeurs éditées par l'utilisateur (id → valeur retenue). C'est CE champ, jamais answer, qui sera injecté.
  const [values, setValues] = useState<Record<string, string>>({});
  // Sélection pour validation par lot (checkboxes)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  // Injection (action finale) : état + résultat (nb injecté + lien de téléchargement).
  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<{ injected: number; url?: string; message?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("recherche_web")
      .select("id, query, answer, citations, model, cost_usd, statut, valeur_retenue, niveau_confiance, created_at")
      .eq("dossier_id", id)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setItems((data ?? []) as Recherche[]);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  // Garde d'accès : la page n'est atteignable qu'APRÈS obtention de résultats (bouton « Trouver
  // l'info sur internet »). Aucune recherche pour ce dossier → on renvoie vers la page mémoire.
  useEffect(() => {
    if (!loading && !error && items.length === 0) {
      router.replace(`/dossiers/${id}/memoire`);
    }
  }, [loading, error, items.length, id, router]);

  // Valeur courante d'un champ : saisie en cours, sinon valeur déjà enregistrée, sinon réponse Perplexity par défaut, sinon vide.
  const valOf = (r: Recherche) => (values[r.id] !== undefined ? values[r.id] : (r.valeur_retenue ?? r.answer ?? ""));

  // VALIDER : enregistre la valeur retenue (saisie humaine OBLIGATOIRE) + statut='validee'.
  // Sans valeur non vide, pas de validation possible (c'est le cœur de l'anti-invention).
  const validate = async (r: Recherche) => {
    const v = valOf(r).trim();
    if (!v) { setError("Saisis d'abord la valeur retenue avant de valider."); return; }
    setBusyId(r.id);
    setError(null);
    const { error } = await supabase
      .from("recherche_web")
      .update({ statut: "validee", valeur_retenue: v })
      .eq("id", r.id);
    if (error) setError(error.message);
    else setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, statut: "validee", valeur_retenue: v } : x)));
    setBusyId(null);
  };

  const toggleSelectAll = (enAttenteList: Recherche[]) => {
    const allSelected = enAttenteList.length > 0 && enAttenteList.every((r) => selectedIds[r.id]);
    const next: Record<string, boolean> = { ...selectedIds };
    for (const r of enAttenteList) {
      next[r.id] = !allSelected;
    }
    setSelectedIds(next);
  };

  const validateBatch = async () => {
    const toValidate = items.filter((r) => r.statut === "en_attente_validation" && selectedIds[r.id]);
    if (toValidate.length === 0) return;

    const emptyItems = toValidate.filter((r) => !valOf(r).trim());
    if (emptyItems.length > 0) {
      setError("Impossible de valider : certains champs sélectionnés ont une valeur retenue vide.");
      return;
    }

    setBusyId("batch");
    setError(null);
    try {
      await Promise.all(
        toValidate.map(async (r) => {
          const v = valOf(r).trim();
          const { error } = await supabase
            .from("recherche_web")
            .update({ statut: "validee", valeur_retenue: v })
            .eq("id", r.id);
          if (error) throw new Error(`Erreur pour "${r.query}": ${error.message}`);
        })
      );

      const validatedMap = new Map(toValidate.map((r) => [r.id, valOf(r).trim()]));
      setItems((prev) =>
        prev.map((x) =>
          validatedMap.has(x.id)
            ? { ...x, statut: "validee", valeur_retenue: validatedMap.get(x.id)! }
            : x
        )
      );
      setSelectedIds((prev) => {
        const next = { ...prev };
        toValidate.forEach((r) => delete next[r.id]);
        return next;
      });
    } catch (e: any) {
      setError(e.message || "Erreur lors de la validation par lot.");
    } finally {
      setBusyId(null);
    }
  };

  // REJETER : change UNIQUEMENT le statut (aucune valeur injectée).
  const reject = async (rechercheId: string) => {
    setBusyId(rechercheId);
    setError(null);
    const { error } = await supabase.from("recherche_web").update({ statut: "rejetee" }).eq("id", rechercheId);
    if (error) setError(error.message);
    else setItems((prev) => prev.map((r) => (r.id === rechercheId ? { ...r, statut: "rejetee" } : r)));
    setBusyId(null);
  };

  // INJECTER (action finale, one-shot) : injecte TOUTES les recherches validées, puis consomme le cadre.
  const runInject = async () => {
    if (!window.confirm(
      "Injecter TOUTES les recherches validées dans le mémoire ?\n\n" +
      "Action finale : le cadre temporaire est consommé après l'injection."
    )) return;
    setInjecting(true);
    setError(null);
    setInjectResult(null);
    try {
      const res = await apiFetch(`/api/dossiers/${id}/recherches/inject`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de l'injection.");
      if (!data.injected) {
        setInjectResult({ injected: 0, message: data.message || "Aucune recherche validée à injecter." });
      } else {
        const url = data.file_path ? `${apiBase}/api/download?file=${encodeURIComponent(data.file_path)}&download=1` : undefined;
        setInjectResult({ injected: data.injected, url, message: data.message });
        await load(); // rafraîchit : validee → injectee
      }
    } catch (e: any) {
      setError(e.message || "Échec de l'injection.");
    } finally {
      setInjecting(false);
    }
  };

  const enAttente = items.filter((r) => r.statut === "en_attente_validation");
  const traitees = items.filter((r) => r.statut !== "en_attente_validation");
  const validatedCount = items.filter((r) => r.statut === "validee").length;

  return (
    <div className="flex h-full flex-col">
      <BandeauDossier className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-5 md:pb-5 md:pt-5 animate-apparaitre">
        <div>
          <div className="font-mono text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Informations publiques manquantes
          </div>
          <h1 className="mt-1.5 font-display text-[24px] font-bold leading-[1.15] md:text-[28px]">Recherches web à valider</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {validatedCount > 0 && (
            <Button size="sm" onClick={runInject} disabled={injecting}>
              {injecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Injecter ({validatedCount})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading || injecting}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            Rafraîchir
          </Button>
        </div>
      </BandeauDossier>

      <DossierNav id={id} />

      <EntreeEtape className="flex-1 overflow-y-auto px-4 py-5 md:px-9 md:py-6">
        <div className="apparait mx-auto max-w-4xl space-y-5">
          {/* Rappel : aucune injection automatique */}
          <div className="flex items-start gap-3.5 rounded-xl border border-[#C9DAF0] bg-gradient-to-r from-info-soft to-[#F7FAFE] px-4 py-3.5">
            <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-card shadow-o1">
              <Info className="h-[19px] w-[19px] text-info" />
            </span>
            <div className="text-[13.5px] leading-relaxed text-muted-foreground [&_strong]:text-foreground">
              Ces réponses proviennent d'une recherche web sourcée (Perplexity) pour des informations
              <strong> publiques manquantes</strong>. Rien n'est inséré automatiquement : vous <strong>saisissez vous-même
              la valeur retenue</strong> (c'est elle, jamais le texte brut, qui sera injectée), puis vous validez.
              L'injection dans le mémoire n'a lieu que via le bouton <strong>« Injecter »</strong> — une action finale
              qui traite toutes les recherches validées d'un coup.
            </div>
          </div>

          {error && (
            <div className="animate-monter rounded-xl border border-[#F2C3C8] bg-gradient-to-r from-destructive-soft to-[#FFF8F8] p-4 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          {injectResult && injectResult.injected > 0 && injectResult.url && (
            <div className="flex animate-monter flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BFE0CC] bg-gradient-to-r from-success-soft to-card p-4 text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-5 w-5 text-success" />
                {injectResult.injected} recherche(s) injectée(s) dans un nouveau mémoire.
              </span>
              <a
                href={injectResult.url}
                download
                className="inline-flex items-center gap-2 rounded-[9px] bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-o1 transition-[background-color,box-shadow,translate] duration-150 hover:bg-primary-hover hover:shadow-o2 motion-safe:hover:-translate-y-px"
              >
                <Download className="h-4 w-4" /> Télécharger le mémoire
              </a>
            </div>
          )}

          {injectResult && injectResult.injected > 0 && !injectResult.url && (
            <div className="flex animate-monter flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BFE0CC] bg-gradient-to-r from-success-soft to-card p-4 text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-5 w-5 text-success" />
                {injectResult.message || `${injectResult.injected} recherche(s) enregistrée(s) en base (statut injectée) et indexée(s) dans la mémoire RAG avec succès !`}
              </span>
            </div>
          )}

          {injectResult && injectResult.injected === 0 && (
            <div className="animate-monter rounded-xl border border-border bg-secondary/60 p-4 text-sm text-muted-foreground">
              {injectResult.message}
            </div>
          )}

          {loading && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Chargement…
              </div>
              <SqueletteCartes nombre={2} />
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[#B9C5D4] bg-gradient-to-b from-card to-[#F8FAFC] p-10 text-center text-[15px] font-semibold text-foreground">
              <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary"><Globe className="h-8 w-8" strokeWidth={1.6} /></span>
              Aucune recherche web pour ce dossier.
            </div>
          )}

          {/* À valider */}
          {enAttente.length > 0 && (
            <section className="apparait space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2 text-[15px] font-semibold">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-warning-soft"><Clock className="h-4 w-4 text-warning" /></span> À valider ({enAttente.length})
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSelectAll(enAttente)}
                  >
                    {enAttente.length > 0 && enAttente.every((r) => selectedIds[r.id]) ? "Désélectionner tout" : "Sélectionner tout"}
                  </Button>
                  {enAttente.some((r) => selectedIds[r.id]) && (
                    <Button
                      size="sm"
                      disabled={busyId !== null}
                      onClick={validateBatch}
                    >
                      {busyId === "batch" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Valider la sélection ({enAttente.filter((r) => selectedIds[r.id]).length})
                    </Button>
                  )}
                </div>
              </div>
              {enAttente.map((r) => (
                <Card key={r.id} className={cn("vive border-l-[3px] border-l-[#E08A1E]", selectedIds[r.id] && "border-primary/50 border-l-primary bg-[#F6F9FD] shadow-o2")}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex flex-wrap items-start justify-between gap-3 text-[15px]">
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={!!selectedIds[r.id]}
                          onChange={(e) => setSelectedIds((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                          className="h-[18px] w-[18px] shrink-0 rounded border-border text-primary focus:ring-ring cursor-pointer"
                        />
                        <span className="min-w-0">{r.query}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Badge variant={STATUT_BADGE[r.statut].variant}>{STATUT_BADGE[r.statut].label}</Badge>
                        {typeof r.niveau_confiance === "number" && (
                          <span className="flex items-center gap-2">
                          {/* Jauge de confiance : même pourcentage que la pastille, même couleur (seuils de la pastille). */}
                          <span className={cn("hidden w-16 sm:block", r.niveau_confiance >= 0.66 ? "text-success" : r.niveau_confiance >= 0.33 ? "text-[#E08A1E]" : "text-[#9AA7B8]")}>
                            <Jauge valeur={r.niveau_confiance * 100} couleur="currentColor" epaisseur={5} />
                          </span>
                          <Badge variant={r.niveau_confiance >= 0.66 ? "success" : r.niveau_confiance >= 0.33 ? "warning" : "secondary"}>
                            Confiance {Math.round(r.niveau_confiance * 100)}%
                          </Badge>
                          </span>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {r.answer && (
                      <p className="whitespace-pre-wrap rounded-lg bg-secondary/50 px-3.5 py-2.5 text-sm leading-6 text-foreground/90">{r.answer}</p>
                    )}
                    <SourceLinks urls={r.citations ?? []} />

                    {/* Valeur retenue : saisie/confirmation HUMAINE — c'est CE texte qui sera injecté. */}
                    <div className="mt-4">
                      <label className="petites-capitales mb-1.5 flex items-center gap-1.5 text-[11px] text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" /> Valeur retenue (saisie obligatoire, injectée telle quelle)
                      </label>
                      <textarea
                        rows={2}
                        value={valOf(r)}
                        onChange={(e) => setValues((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Saisir la valeur exacte à insérer dans le mémoire (à partir des sources ci-dessus)…"
                        className="w-full resize-y rounded-[9px] border border-input bg-card px-3 py-2 text-sm outline-none"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-[11px] text-subtle-foreground">
                        {r.model ?? "—"}
                        {typeof r.cost_usd === "number" ? ` · ${r.cost_usd.toFixed(5)} $` : ""}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId !== null}
                          onClick={() => reject(r.id)}
                        >
                          {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          Rejeter
                        </Button>
                        <Button
                          size="sm"
                          disabled={busyId !== null || valOf(r).trim() === ""}
                          onClick={() => validate(r)}
                        >
                          {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Valider
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          {/* Déjà traitées */}
          {traitees.length > 0 && (
            <section className="apparait space-y-2.5">
              <div className="petites-capitales flex items-center gap-2 pt-1"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-success" />Traitées ({traitees.length})</div>
              {traitees.map((r) => (
                <Card key={r.id} className="bg-[#FBFCFD] shadow-none transition-[opacity,box-shadow] hover:shadow-o1">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 flex-1 font-medium">{r.query}</span>
                      <Badge variant={STATUT_BADGE[r.statut].variant}>{STATUT_BADGE[r.statut].label}</Badge>
                      {typeof r.niveau_confiance === "number" && (
                        <Badge variant={r.niveau_confiance >= 0.66 ? "success" : r.niveau_confiance >= 0.33 ? "warning" : "secondary"}>
                          Confiance {Math.round(r.niveau_confiance * 100)}%
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {r.answer && (
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{r.answer}</p>
                    )}
                    <SourceLinks urls={r.citations ?? []} />
                  </CardContent>
                </Card>
              ))}
            </section>
          )}
        </div>
      </EntreeEtape>
    </div>
  );
}
