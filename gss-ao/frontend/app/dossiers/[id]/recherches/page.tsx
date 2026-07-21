"use client";

import { useCallback, useEffect, useState } from "react";
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
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Sources ({urls.length})
      </div>
      <ul className="space-y-1">
        {urls.map((u, i) => {
          let host = u;
          try { host = new URL(u).host.replace(/^www\./, ""); } catch { /* garde l'URL brute */ }
          return (
            <li key={`${u}-${i}`}>
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span>{host}</span>
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

  const [items, setItems] = useState<Recherche[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Valeurs éditées par l'utilisateur (id → valeur retenue). C'est CE champ, jamais answer, qui sera injecté.
  const [values, setValues] = useState<Record<string, string>>({});
  // Injection (action finale) : état + résultat (nb injecté + lien de téléchargement).
  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<{ injected: number; url?: string; message?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("recherche_web")
      .select("id, query, answer, citations, model, cost_usd, statut, valeur_retenue, created_at")
      .eq("dossier_id", id)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setItems((data ?? []) as Recherche[]);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  // Valeur courante d'un champ : saisie en cours, sinon valeur déjà enregistrée, sinon vide.
  const valOf = (r: Recherche) => (values[r.id] !== undefined ? values[r.id] : (r.valeur_retenue ?? ""));

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
        const url = `${apiBase}/api/download?file=${encodeURIComponent(data.file_path)}&download=1`;
        setInjectResult({ injected: data.injected, url });
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
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Informations publiques manquantes
          </div>
          <h1 className="text-xl font-semibold">Recherches web à valider</h1>
        </div>
        <div className="flex items-center gap-2">
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
      </header>

      <DossierNav id={id} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Rappel : aucune injection automatique */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              Ces réponses proviennent d'une recherche web sourcée (Perplexity) pour des informations
              <strong> publiques manquantes</strong>. Rien n'est inséré automatiquement : vous <strong>saisissez vous-même
              la valeur retenue</strong> (c'est elle, jamais le texte brut, qui sera injectée), puis vous validez.
              L'injection dans le mémoire n'a lieu que via le bouton <strong>« Injecter »</strong> — une action finale
              qui traite toutes les recherches validées d'un coup.
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {injectResult && injectResult.injected > 0 && injectResult.url && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-5 w-5 text-success" />
                {injectResult.injected} recherche(s) injectée(s) dans un nouveau mémoire.
              </span>
              <a
                href={injectResult.url}
                download
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Download className="h-4 w-4" /> Télécharger le mémoire
              </a>
            </div>
          )}

          {injectResult && injectResult.injected === 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {injectResult.message}
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Aucune recherche web pour ce dossier.
            </div>
          )}

          {/* À valider */}
          {enAttente.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-warning" /> À valider ({enAttente.length})
              </div>
              {enAttente.map((r) => (
                <Card key={r.id}>
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between gap-3 text-base">
                      <span className="min-w-0">{r.query}</span>
                      <Badge variant={STATUT_BADGE[r.statut].variant}>{STATUT_BADGE[r.statut].label}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {r.answer && (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{r.answer}</p>
                    )}
                    <SourceLinks urls={r.citations ?? []} />

                    {/* Valeur retenue : saisie/confirmation HUMAINE — c'est CE texte qui sera injecté. */}
                    <div className="mt-4">
                      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" /> Valeur retenue (saisie obligatoire, injectée telle quelle)
                      </label>
                      <textarea
                        rows={2}
                        value={valOf(r)}
                        onChange={(e) => setValues((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Saisir la valeur exacte à insérer dans le mémoire (à partir des sources ci-dessus)…"
                        className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground">
                        {r.model ?? "—"}
                        {typeof r.cost_usd === "number" ? ` · ${r.cost_usd.toFixed(5)} $` : ""}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === r.id}
                          onClick={() => reject(r.id)}
                        >
                          {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          Rejeter
                        </Button>
                        <Button
                          size="sm"
                          disabled={busyId === r.id || valOf(r).trim() === ""}
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
            <section className="space-y-3">
              <div className="text-sm font-semibold text-muted-foreground">Traitées ({traitees.length})</div>
              {traitees.map((r) => (
                <Card key={r.id} className="opacity-80">
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 font-medium">{r.query}</span>
                      <Badge variant={STATUT_BADGE[r.statut].variant}>{STATUT_BADGE[r.statut].label}</Badge>
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
      </div>
    </div>
  );
}
