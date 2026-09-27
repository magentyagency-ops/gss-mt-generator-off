"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Download, Loader2, Mail, PencilLine, Send, Users } from "lucide-react";
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
  groupe?: string;
}

/** Emplacements qui attendent la même donnée : une seule carte, une seule saisie. */
function grouper(els: Element[]): Element[][] {
  const m = new Map<string, Element[]>();
  for (const e of els) {
    const g = e.groupe || e.cle;
    (m.get(g) ?? m.set(g, []).get(g)!).push(e);
  }
  return [...m.values()];
}

interface Etat {
  dossierId: string;
  mode: "cadre" | "libre";
  fichier: string;
  majLe: string;
  elements: Element[];
  restants: number;
}

interface Envoi {
  personne: string;
  fonction?: string;
  email: string;
  questions: Array<{ cle: string; question: string }>;
}

const PLACEHOLDER = "[À COMPLÉTER]";

const SOURCE_LIBELLE: Record<NonNullable<Element["source"]>, string> = {
  saisie: "Saisi dans l'application",
  equipe: "Réponse de l'équipe par e-mail, intégrée automatiquement",
  memoires: "Déjà présent dans les mémoires GSS, intégré automatiquement",
};

/** Phrase du document avec l'emplacement mis en évidence. */
function Phrase({ texte }: { texte: string }) {
  const morceaux = texte.split(PLACEHOLDER);
  return (
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
      « {morceaux.map((m, i) => (
        <span key={i}>
          {m}
          {i < morceaux.length - 1 && (
            <span className="rounded bg-warning/20 px-1 font-semibold text-foreground">{PLACEHOLDER}</span>
          )}
        </span>
      ))} »
    </p>
  );
}

/**
 * Document généré + informations restant à compléter. Un clic sur « [À COMPLÉTER] » (dans l'aperçu
 * ou dans la liste) ouvre la saisie ; l'information est insérée immédiatement dans le document, à
 * l'endroit exact (signet Word de l'emplacement), sans perdre la position de lecture. Les réponses
 * d'équipe reçues par e-mail sont intégrées par le serveur : le panneau se met à jour seul.
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
  const [envois, setEnvois] = useState<Envoi[] | null>(null);
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [reponseEnCours, setReponseEnCours] = useState<string | null>(null);
  const itemsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const etatRef = useRef<Etat | null>(null);
  etatRef.current = etat;
  const onAbsentRef = useRef(onAbsent);
  onAbsentRef.current = onAbsent;
  // Position de lecture dans l'aperçu et emplacements à mettre en évidence au prochain rendu.
  const scrollRef = useRef(0);
  const conteneurRef = useRef<HTMLDivElement | null>(null);
  const aSignalerRef = useRef<string[]>([]);
  const positionAvantRenduRef = useRef(0);      // figée au moment de la mise à jour (le re-rendu remet l'ascenseur à 0)
  const emplacementCibleRef = useRef<string | null>(null); // emplacement cliqué : c'est lui qu'on centre

  /** Applique un nouvel état ; les emplacements qui viennent d'être complétés seront signalés. */
  const appliquerEtat = useCallback(
    (e: Etat) => {
      const avant = etatRef.current;
      if (avant) {
        const ouvertsAvant = new Set(avant.elements.filter((x) => x.statut === "ouvert").map((x) => x.cle));
        const nouveaux = e.elements.filter((x) => x.statut === "complete" && ouvertsAvant.has(x.cle));
        if (nouveaux.length) {
          aSignalerRef.current = nouveaux.map((x) => x.cle);
          if (nouveaux.some((x) => x.source === "equipe")) {
            setNotice(`Réponse de l'équipe reçue : ${nouveaux.map((x) => `« ${x.valeur} »`).join(", ")} intégrée(s) au document.`);
          }
        }
      }
      positionAvantRenduRef.current = conteneurRef.current ? conteneurRef.current.scrollTop : scrollRef.current;
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
  // serveur ; elle apparaît ici sans rechargement de la page.
  useEffect(() => {
    charger();
    const t = setInterval(charger, 10000);
    return () => clearInterval(t);
  }, [charger]);

  const choisir = (cle: string) => {
    setSelection(cle);
    setValeur("");
    setErreur(null);
    itemsRef.current[cle]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // Aperçu Word : chaque emplacement est retrouvé par son signet (id = clé) — le texte qui le suit
  // est exactement l'emplacement. Ouvert → cliquable ; complété → surligné en vert.
  const onRendered = useCallback((container: HTMLDivElement) => {
    conteneurRef.current = container;
    container.onscroll = () => { scrollRef.current = container.scrollTop; };
    const aSignaler = aSignalerRef.current;
    aSignalerRef.current = [];
    let cible: HTMLElement | null = null;
    const prioritaire = emplacementCibleRef.current;
    emplacementCibleRef.current = null;
    for (const el of etatRef.current?.elements || []) {
      const repere = container.querySelector<HTMLElement>(`[id="${el.cle}"]`);
      const span = repere?.nextElementSibling as HTMLElement | null;
      if (!span) continue;
      span.style.borderRadius = "3px";
      span.style.padding = "0 2px";
      if (el.statut === "ouvert") {
        span.style.background = "#FDE7C8";
        span.style.borderBottom = "2px dashed #D97706";
        span.style.cursor = "pointer";
        span.title = `Cliquer pour compléter : ${el.question}`;
        span.onclick = () => choisir(el.cle);
      } else {
        span.style.background = "#DCFCE7";
        span.style.borderBottom = "2px solid #16A34A";
        span.title = `Complété — ${el.question}`;
        if (aSignaler.includes(el.cle)) {
          span.classList.add("gss-complete-flash");
          if (!cible || el.cle === prioritaire) cible = span;
        }
      }
    }
    if (cible) {
      // On reste à l'endroit corrigé : l'information ajoutée est centrée dans l'aperçu.
      const c = container.getBoundingClientRect();
      const s = cible.getBoundingClientRect();
      container.scrollTop += s.top - c.top - container.clientHeight / 2;
    } else {
      container.scrollTop = positionAvantRenduRef.current;
    }
    scrollRef.current = container.scrollTop;
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
      emplacementCibleRef.current = selection;
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
    setEnvois(null);
    try {
      const res = await apiFetch(`/api/dossiers/${dossierId}/completion/demander`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi.");
      if (data.demo) {
        setEnvois(data.envois || []);
        setNotice(`${data.triggered} question(s) préparée(s) pour ${data.envois?.length || 0} destinataire(s) de l'annuaire GSS. Démonstration : les e-mails ne partent pas, vous pouvez répondre à la place de chaque destinataire ci-dessous.`);
      } else if (!data.triggered) {
        setNotice(data.message || "Aucune information à demander.");
      } else {
        const lignes = (data.results || []).map((r: any) => `${r.sent ? "✓" : "✗"} ${r.label}${r.personne ? ` → ${r.personne} (${r.email})` : ""}`);
        setNotice(`${data.sent}/${data.triggered} question(s) envoyée(s) par e-mail. Chaque réponse sera placée automatiquement à son emplacement dans le document, dès sa réception.\n${lignes.join("\n")}`);
      }
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setEnvoi(false);
    }
  }

  /** Démonstration : réponse d'un destinataire, traitée comme un vrai e-mail de réponse. */
  async function repondreEnvoi(env: Envoi) {
    const texte = (reponses[env.email] || "").trim();
    if (!texte) return;
    setReponseEnCours(env.email);
    try {
      const res = await apiFetch(`/api/dossiers/${dossierId}/completion/simuler-reponse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: env.questions.map((q) => `- ${q.question}`).join("\n"),
          reponse: texte,
          cles: env.questions.map((q) => q.cle),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec.");
      appliquerEtat(data);
      setNotice(
        data.integres?.length
          ? `Réponse de ${env.personne} reçue : intégrée automatiquement dans ${data.integres.length} emplacement(s) du document.`
          : `La réponse de ${env.personne} ne renseigne aucune des questions posées : rien n'a été modifié.`,
      );
      setReponses((r) => ({ ...r, [env.email]: "" }));
      setEnvois((l) => l && l.map((x) => (x.email === env.email ? { ...x, questions: x.questions.filter((q) => !data.integres?.includes(q.cle)) } : x)).filter((x) => x.questions.length));
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setReponseEnCours(null);
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
  const groupesOuverts = grouper(ouverts);
  const groupesFaits = grouper(faits);
  const url = `${apiBase}/api/download?file=${encodeURIComponent(etat.fichier)}`;

  return (
    <Card className="overflow-hidden">
      <style>{`
        @keyframes gssCompleteFlash {
          0%, 30% { background: #86EFAC; box-shadow: 0 0 0 4px #86EFAC; }
          100% { background: #DCFCE7; box-shadow: 0 0 0 0 transparent; }
        }
        .gss-complete-flash { animation: gssCompleteFlash 2.4s ease-out 1; }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h3 className="font-semibold text-foreground">Document généré</h3>
          <p className="text-sm text-muted-foreground">
            {ouverts.length
              ? `${groupesOuverts.length} information(s) à compléter (${ouverts.length} emplacement(s)) — cliquez sur un « ${PLACEHOLDER} » pour la saisir.`
              : "Toutes les informations sont complétées."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ouverts.some((e) => !e.pourAcheteur) && (
            <Button variant="outline" size="sm" className="gap-2" disabled={envoi} onClick={demanderEquipe}>
              {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              {envoi ? "Préparation…" : "Demander à l'équipe"}
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

      {envois && envois.length > 0 && (
        <div className="grid gap-3 border-b border-border bg-muted/10 px-6 py-4 md:grid-cols-2">
          {envois.map((env) => (
            <div key={env.email} className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{env.personne}</span>
                <span className="text-xs text-muted-foreground">{env.fonction ? `${env.fonction} · ` : ""}{env.email}</span>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-foreground">
                {env.questions.map((q) => <li key={q.cle}>{q.question}</li>)}
              </ul>
              <textarea
                id={`reponse-${env.email}`}
                value={reponses[env.email] || ""}
                onChange={(ev) => setReponses((r) => ({ ...r, [env.email]: ev.target.value }))}
                rows={3}
                placeholder={`Répondre comme ${env.personne}, comme on répondrait à l'e-mail…`}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-1" disabled={reponseEnCours === env.email || !(reponses[env.email] || "").trim()} onClick={() => repondreEnvoi(env)}>
                  {reponseEnCours === env.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Envoyer la réponse
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 p-4">
          {etat.mode === "cadre" ? (
            <DocxPreviewViewer fileUrl={url} onRendered={onRendered} />
          ) : (
            <iframe key={etat.fichier} src={url} className="h-[760px] w-full rounded-md border border-border" title="Aperçu du mémoire" />
          )}
        </div>

        <aside className="max-h-[820px] space-y-3 overflow-y-auto border-t border-border bg-muted/10 p-4 lg:border-l lg:border-t-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            À compléter ({groupesOuverts.length})
          </h4>
          {groupesOuverts.map((membres) => {
            const e = membres[0];
            const actif = membres.some((m) => m.cle === selection);
            return (
              <div
                key={e.cle}
                ref={(n) => { membres.forEach((m) => { itemsRef.current[m.cle] = n; }); }}
                className={cn(
                  "rounded-lg border bg-card p-3 text-sm transition-colors",
                  actif ? "border-warning ring-2 ring-warning/30" : "border-border hover:border-warning/60",
                )}
              >
                <button type="button" className="w-full text-left" onClick={() => choisir(e.cle)}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{e.question}</span>
                    {e.pourAcheteur ? <Badge variant="secondary">Acheteur</Badge> : <Badge variant="warning" className="shrink-0">À compléter</Badge>}
                  </div>
                  {membres.length > 1 && (
                    <p className="mt-1 text-xs font-medium text-foreground">Même information à {membres.length} endroits du document : une seule saisie les complète tous.</p>
                  )}
                  {membres.map((m) => m.contexte && <Phrase key={m.cle} texte={m.contexte} />)}
                </button>
                {actif && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      id={`completion-${e.cle}`}
                      autoFocus
                      value={valeur}
                      onChange={(ev) => setValeur(ev.target.value)}
                      rows={2}
                      placeholder="Information à insérer à la place de « [À COMPLÉTER] »…"
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
            );
          })}

          {faits.length > 0 && (
            <>
              <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complété ({groupesFaits.length})</h4>
              {groupesFaits.map((membres) => membres[0]).map((e) => (
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
        </aside>
      </div>
    </Card>
  );
}
