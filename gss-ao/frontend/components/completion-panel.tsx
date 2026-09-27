"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Download, Loader2, Mail, PencilLine, Users } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { apiFetch, apiBase } from "@/lib/api";
import { cn } from "@/lib/utils";

const DocxPreviewViewer = dynamic(
  () => import("@/components/docx-preview-viewer").then((mod) => mod.DocxPreviewViewer),
  { ssr: false },
);

interface Element {
  cle: string;
  question: string;
  contexte: string;
  statut: "ouvert" | "complete";
  valeur?: string;
  source?: "saisie" | "equipe" | "memoires";
  completeLe?: string;
  pourAcheteur?: boolean;
}

interface Etat {
  dossierId: string;
  mode: "cadre" | "libre";
  fichier: string;
  majLe: string;
  elements: Element[];
  restants: number;
}

const PLACEHOLDER = "[À COMPLÉTER]";

const SOURCE_LIBELLE: Record<NonNullable<Element["source"]>, string> = {
  saisie: "Saisi dans l'application",
  equipe: "Réponse de l'équipe par e-mail, intégrée automatiquement",
  memoires: "Déjà présent dans les mémoires GSS, intégré automatiquement",
};

/**
 * Document généré + informations restant à compléter. Un clic sur « [À COMPLÉTER] » (dans l'aperçu
 * ou dans la liste) ouvre la saisie ; l'information est insérée immédiatement dans le document.
 * Les réponses d'équipe reçues par e-mail sont intégrées par le serveur : le panneau se met à jour seul.
 */
export function CompletionPanel({
  dossierId,
  demo = false,
  onAbsent,
}: {
  dossierId: string;
  demo?: boolean;
  /** Appelé si aucun document généré n'est disponible pour ce dossier. */
  onAbsent?: () => void;
}) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [chargement, setChargement] = useState(true);
  const [selection, setSelection] = useState<string | null>(null);
  const [valeur, setValeur] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [simQuestion, setSimQuestion] = useState("");
  const [simReponse, setSimReponse] = useState("");
  const [simulation, setSimulation] = useState(false);
  const itemsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const etatRef = useRef<Etat | null>(null);
  etatRef.current = etat;
  const onAbsentRef = useRef(onAbsent);
  onAbsentRef.current = onAbsent;

  const appliquerEtat = useCallback(
    (e: Etat) => {
      setEtat(e);
      if (!demo) {
        try { localStorage.setItem(`generated_docx_${dossierId}`, e.fichier); } catch { /* ignore */ }
      }
    },
    [demo, dossierId],
  );

  const charger = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/dossiers/${dossierId}/completion`);
      if (res.status === 404) { onAbsentRef.current?.(); return; }
      const data = await res.json();
      if (res.ok) {
        const courant = etatRef.current;
        if (!courant || courant.fichier !== data.fichier || courant.majLe !== data.majLe) appliquerEtat(data);
      }
    } catch { /* réessai au prochain passage */ }
    finally { setChargement(false); }
  }, [dossierId, appliquerEtat]);

  // Chargement puis surveillance : une réponse d'équipe reçue par e-mail met le document à jour côté
  // serveur ; on la reflète ici sans rechargement de la page.
  useEffect(() => {
    charger();
    const t = setInterval(charger, 15000);
    return () => clearInterval(t);
  }, [charger]);

  const choisir = (cle: string) => {
    setSelection(cle);
    setValeur("");
    setErreur(null);
    itemsRef.current[cle]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Aperçu Word : chaque « [À COMPLÉTER] » restant devient cliquable (dans l'ordre du document).
  const onRendered = useCallback((container: HTMLDivElement) => {
    const ouverts = (etatRef.current?.elements || []).filter((e) => e.statut === "ouvert");
    const spans = Array.from(container.querySelectorAll("span")).filter(
      (s) => s.children.length === 0 && (s.textContent || "").trim() === PLACEHOLDER,
    );
    spans.forEach((span, i) => {
      const el = ouverts[i];
      if (!el) return;
      span.style.background = "#FDE7C8";
      span.style.borderBottom = "2px dashed #D97706";
      span.style.cursor = "pointer";
      span.style.borderRadius = "3px";
      span.title = `Cliquer pour compléter : ${el.question}`;
      span.onclick = () => choisir(el.cle);
    });
  }, []);

  async function enregistrer() {
    if (!selection || !valeur.trim()) return;
    setEnregistrement(true);
    setErreur(null);
    try {
      const res = await apiFetch(`/api/dossiers/${dossierId}/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cle: selection, valeur }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'enregistrement.");
      appliquerEtat(data);
      setSelection(null);
      setValeur("");
    } catch (e: any) {
      setErreur(e.message);
    } finally {
      setEnregistrement(false);
    }
  }

  async function demanderEquipe() {
    setEnvoi(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/dossiers/${dossierId}/completion/demander`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi.");
      if (data.demo) setNotice(`Démonstration : ${data.triggered} question(s) seraient envoyées à l'équipe (aucun e-mail envoyé).`);
      else if (!data.triggered) setNotice(data.message || "Aucune information à demander.");
      else {
        const lignes = (data.results || []).map((r: any) => `${r.sent ? "✓" : "✗"} ${r.label}${r.personne ? ` → ${r.personne}` : ""}`);
        setNotice(`${data.sent}/${data.triggered} question(s) envoyée(s). Les réponses seront intégrées automatiquement au document dès leur réception.\n${lignes.join("\n")}`);
      }
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setEnvoi(false);
    }
  }

  async function simulerReponse() {
    if (!simReponse.trim()) return;
    setSimulation(true);
    setNotice(null);
    try {
      const q = etat?.elements.find((e) => e.cle === simQuestion);
      const res = await apiFetch(`/api/dossiers/${dossierId}/completion/simuler-reponse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q?.question || "", reponse: simReponse }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la simulation.");
      appliquerEtat(data);
      setNotice(
        data.integres?.length
          ? `Réponse reçue et intégrée automatiquement dans ${data.integres.length} emplacement(s) du document.`
          : "La réponse ne renseigne aucun emplacement restant : rien n'a été modifié.",
      );
      setSimReponse("");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setSimulation(false);
    }
  }

  if (chargement && !etat) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du document…
      </div>
    );
  }
  if (!etat) return null;

  const ouverts = etat.elements.filter((e) => e.statut === "ouvert");
  const faits = etat.elements.filter((e) => e.statut === "complete");
  const url = `${apiBase}/api/download?file=${encodeURIComponent(etat.fichier)}`;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h3 className="font-semibold text-foreground">Document généré</h3>
          <p className="text-sm text-muted-foreground">
            {ouverts.length
              ? `${ouverts.length} information(s) à compléter — cliquez sur un « ${PLACEHOLDER} » pour la saisir.`
              : "Toutes les informations sont complétées."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ouverts.some((e) => !e.pourAcheteur) && (
            <Button variant="outline" size="sm" className="gap-2" disabled={envoi} onClick={demanderEquipe}>
              {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Demander à l'équipe
            </Button>
          )}
          <a href={`${url}&download=1`} download>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" /> Télécharger
            </Button>
          </a>
        </div>
      </div>
      {notice && <p className="whitespace-pre-line border-b border-border bg-muted/30 px-6 py-3 text-xs text-muted-foreground">{notice}</p>}

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 p-4">
          {etat.mode === "cadre" ? (
            <DocxPreviewViewer key={etat.fichier} fileUrl={url} onRendered={onRendered} />
          ) : (
            <iframe key={etat.fichier} src={url} className="h-[760px] w-full rounded-md border border-border" title="Aperçu du mémoire" />
          )}
        </div>

        <aside className="max-h-[820px] space-y-3 overflow-y-auto border-t border-border bg-muted/10 p-4 lg:border-l lg:border-t-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            À compléter ({ouverts.length})
          </h4>
          {ouverts.map((e) => (
            <div
              key={e.cle}
              ref={(n) => { itemsRef.current[e.cle] = n; }}
              className={cn(
                "rounded-lg border bg-card p-3 text-sm transition-colors",
                selection === e.cle ? "border-warning ring-2 ring-warning/30" : "border-border hover:border-warning/60",
              )}
            >
              <button type="button" className="w-full text-left" onClick={() => choisir(e.cle)}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground">{e.question}</span>
                  {e.pourAcheteur ? <Badge variant="secondary">Acheteur</Badge> : <Badge variant="warning">À compléter</Badge>}
                </div>
                {e.contexte && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{e.contexte}</p>}
              </button>
              {selection === e.cle && (
                <div className="mt-3 space-y-2">
                  <textarea
                    id={`completion-${e.cle}`}
                    autoFocus
                    value={valeur}
                    onChange={(ev) => setValeur(ev.target.value)}
                    rows={3}
                    placeholder="Information à insérer dans le document…"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {erreur && <p className="text-xs text-destructive">{erreur}</p>}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelection(null)}>Annuler</Button>
                    <Button size="sm" className="gap-1" disabled={enregistrement || !valeur.trim()} onClick={enregistrer}>
                      {enregistrement ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                      {enregistrement ? (etat.mode === "libre" ? "Mise à jour du PDF…" : "Intégration…") : "Intégrer au document"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {faits.length > 0 && (
            <>
              <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complété ({faits.length})</h4>
              {faits.map((e) => (
                <div key={e.cle} className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{e.question}</p>
                      <p className="mt-1 whitespace-pre-line text-foreground">{e.valeur}</p>
                      {e.source && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          {e.source === "equipe" && <Mail className="h-3 w-3" />}
                          {SOURCE_LIBELLE[e.source]}
                          {e.completeLe ? ` · ${new Date(e.completeLe).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {demo && ouverts.length > 0 && (
            <div className="mt-4 space-y-2 rounded-lg border border-dashed border-border bg-card p-3 text-sm">
              <p className="font-medium text-foreground">Démonstration : réponse d'un collègue par e-mail</p>
              <p className="text-xs text-muted-foreground">
                Simule la réception d'un e-mail de réponse. Il est traité comme un vrai e-mail : l'information est placée automatiquement aux bons emplacements du document.
              </p>
              <select
                id="demo-question"
                value={simQuestion}
                onChange={(ev) => setSimQuestion(ev.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Question concernée (facultatif)</option>
                {ouverts.map((e) => <option key={e.cle} value={e.cle}>{e.question.slice(0, 90)}</option>)}
              </select>
              <textarea
                id="demo-reponse"
                value={simReponse}
                onChange={(ev) => setSimReponse(ev.target.value)}
                rows={3}
                placeholder="Ex. : Bonjour, pour Étampes nous prévoyons 2 agents par vacation et 1 maître-chien la nuit. Cordialement."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-1" disabled={simulation || !simReponse.trim()} onClick={simulerReponse}>
                  {simulation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Recevoir la réponse
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </Card>
  );
}
