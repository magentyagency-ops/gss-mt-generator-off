"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Download, FileText, Loader2, Mail, MessagesSquare, Paperclip, PencilLine, Plus, Send, Upload, Users, X } from "lucide-react";
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
  /** Format court imposé par le RC (nombre de pages maximum et plan). */
  court?: { pagesMax: number; parties: string[] };
  conversation?: Array<{ role: "utilisateur" | "assistant"; texte: string; date: string; modifies?: string[]; pieces?: string[] }>;
}

/** Pièces jointes acceptées par l'assistant : photos (insérables dans le mémoire) et documents (sources). */
const EXTENSIONS_PIECES = [".jpg", ".jpeg", ".png", ".pdf", ".docx", ".doc", ".txt", ".md"];
const estImage = (f: File) => /\.(jpe?g|png)$/i.test(f.name);

/** Exemples de demandes affichés quand la conversation avec l'assistant est vide. */
const EXEMPLES_ASSISTANT: Record<Etat["mode"] | "court", string[]> = {
  cadre: [
    "Dans la réponse sur les délais d'intervention, précise que le chef de site est joignable 24h/24 le week-end.",
    "Développe la réponse sur la stabilité des équipes avec un exemple concret.",
    "Ajoute une page en annexe présentant notre démarche qualité.",
  ],
  court: [
    "Dans la partie sur la continuité de service, précise que le chef de site est joignable 24h/24 le week-end.",
    "Raccourcis la partie sur les moyens matériels pour rester dans la limite de pages.",
    "Reformule la décomposition du prix de façon plus synthétique.",
  ],
  libre: [
    "Refais la rubrique sur les plannings en insistant sur la réactivité le week-end.",
    "Ajoute une page sur la sensibilisation des agents à la cybersécurité dans le chapitre II.",
    "Raccourcis la rubrique sur les tenues et supprime la partie sur les équipements de protection.",
  ],
};

interface Envoi {
  personne: string;
  fonction?: string;
  email: string;
  questions: Array<{ cle: string; question: string }>;
}

interface Preparation {
  annuaire: Array<{ id: string; nom: string; fonction: string; email: string }>;
  questions: Array<{ id: string; question: string; contexte: string; proposes: string[]; absentsAnnuaire: string[] }>;
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
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [choix, setChoix] = useState<Record<string, string[]>>({});
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [reponseEnCours, setReponseEnCours] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<"completer" | "assistant">("completer");
  const [message, setMessage] = useState("");
  const [enAttenteAssistant, setEnAttenteAssistant] = useState<string | null>(null);
  const [erreurAssistant, setErreurAssistant] = useState<string | null>(null);
  const [pageLibre, setPageLibre] = useState<number | undefined>(undefined);
  const finConversationRef = useRef<HTMLDivElement | null>(null);
  const [pieces, setPieces] = useState<File[]>([]);
  const [survolDepot, setSurvolDepot] = useState(false);
  const entreePiecesRef = useRef<HTMLInputElement | null>(null);

  /** Ajoute des fichiers aux pièces jointes (bouton « + » ou glisser-déposer). */
  const ajouterPieces = (liste: FileList | File[]) => {
    const fichiers = Array.from(liste);
    const refuses = fichiers.filter((f) => !EXTENSIONS_PIECES.some((e) => f.name.toLowerCase().endsWith(e)));
    const acceptes = fichiers.filter((f) => !refuses.includes(f));
    if (refuses.length) setErreurAssistant(`Format non pris en charge : ${refuses.map((f) => f.name).join(", ")}. Photos : JPEG ou PNG ; documents : PDF, Word ou texte.`);
    else setErreurAssistant(null);
    if (acceptes.length) {
      setPieces((p) => [...p, ...acceptes].slice(0, 10));
      setOnglet("assistant");
    }
  };
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
    // Réponses réécrites par l'assistant (signets GSS_CH_) : tout le texte de la réponse est signalé.
    for (const cle of aSignaler.filter((c) => c.startsWith("GSS_CH_"))) {
      const repere = container.querySelector<HTMLElement>(`[id="${cle}"]`);
      let n = repere?.nextElementSibling as HTMLElement | null;
      for (let i = 0; n && i < 60; i++, n = n.nextElementSibling as HTMLElement | null) {
        if (n.id && n.id.startsWith("GSS_CH_")) break;
        if (n.tagName === "SPAN" && (n.textContent || "").trim()) {
          n.classList.add("gss-modif-flash");
          if (!cible) cible = n;
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

  /** Assistant de modification : la demande est appliquée au document, qui est mis à jour aussitôt. */
  async function envoyerAssistant(texte?: string) {
    const m = (texte ?? message).trim();
    const jointes = pieces;
    if ((!m && !jointes.length) || enAttenteAssistant) return;
    setEnAttenteAssistant(m || `${jointes.length} pièce(s) jointe(s)`);
    setErreurAssistant(null);
    setMessage("");
    setPieces([]);
    try {
      const corps = new FormData();
      corps.append("message", m);
      jointes.forEach((f) => corps.append("fichiers", f));
      const res = await apiFetch(`/api/dossiers/${dossierId}/assistant`, { method: "POST", body: corps });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'assistant n'a pas pu traiter la demande.");
      if (data.modifies?.length) aSignalerRef.current = data.modifies;
      if (data.page) setPageLibre(data.page);
      appliquerEtat(data);
    } catch (e: any) {
      setErreurAssistant(e.message);
      setMessage(m);
      setPieces(jointes);
    } finally {
      setEnAttenteAssistant(null);
    }
  }

  useEffect(() => {
    finConversationRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [etat?.conversation?.length, enAttenteAssistant]);

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

  /** Étape 1 : questions à envoyer et personnes proposées (le pôle entier, coché par défaut). */
  async function demanderEquipe() {
    setEnvoi(true);
    setNotice(null);
    setEnvois(null);
    try {
      const res = await apiFetch(`/api/dossiers/${dossierId}/completion/preparer`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la préparation.");
      if (!data.questions?.length) { setNotice("Aucune information à demander."); return; }
      setPreparation(data);
      setChoix(Object.fromEntries(data.questions.map((q: any) => [q.id, q.proposes])));
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setEnvoi(false);
    }
  }

  const basculer = (qid: string, pid: string) =>
    setChoix((c) => ({ ...c, [qid]: (c[qid] || []).includes(pid) ? c[qid].filter((x) => x !== pid) : [...(c[qid] || []), pid] }));

  /** Étape 2 : envoi aux personnes cochées. */
  async function envoyerQuestions() {
    setEnvoi(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/dossiers/${dossierId}/completion/demander`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: choix }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi.");
      setPreparation(null);
      if (data.demo) {
        setEnvois(data.envois || []);
        setNotice(`${data.triggered} question(s) préparée(s) pour ${data.envois?.length || 0} destinataire(s). Démonstration : les e-mails ne partent pas, vous pouvez répondre à la place de chaque destinataire ci-dessous.`);
      } else if (!data.triggered) {
        setNotice(data.message || "Aucune information à demander.");
      } else {
        const lignes = (data.results || []).map((r: any) => `${r.sent ? "✓" : "✗"} ${r.label}${r.personne ? ` → ${r.personne} (${r.email})` : ""}`);
        setNotice(`${data.sent}/${lignes.length} envoi(s) effectué(s) par e-mail. Chaque réponse sera placée automatiquement à son emplacement dans le document, dès sa réception.\n${lignes.join("\n")}`);
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
        @keyframes gssModifFlash {
          0%, 35% { background: #BFDBFE; box-shadow: 0 0 0 3px #BFDBFE; }
          100% { background: transparent; box-shadow: 0 0 0 0 transparent; }
        }
        .gss-modif-flash { animation: gssModifFlash 3s ease-out 1; border-radius: 2px; }
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

      {preparation && (
        <div className="space-y-3 border-b border-border bg-muted/10 px-6 py-4">
          <p className="text-sm font-medium text-foreground">Questions à envoyer — personnes proposées (décochez ou ajoutez selon le besoin)</p>
          {preparation.questions.map((q) => {
            const coches = choix[q.id] || [];
            const proposes = preparation.annuaire.filter((p) => q.proposes.includes(p.id) || coches.includes(p.id));
            const autres = preparation.annuaire.filter((p) => !proposes.some((x) => x.id === p.id));
            return (
              <div key={q.id} className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-medium text-foreground">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {proposes.map((p) => (
                    <label key={p.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs", coches.includes(p.id) ? "border-primary bg-primary/5" : "border-border")}>
                      <input id={`dest-${q.id}-${p.id}`} type="checkbox" checked={coches.includes(p.id)} onChange={() => basculer(q.id, p.id)} />
                      <span className="font-medium">{p.nom}</span>
                      <span className="text-muted-foreground">{p.fonction}</span>
                    </label>
                  ))}
                  {autres.length > 0 && (
                    <select
                      id={`ajout-${q.id}`}
                      value=""
                      onChange={(ev) => ev.target.value && basculer(q.id, ev.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="">+ Ajouter une personne…</option>
                      {autres.map((p) => <option key={p.id} value={p.id}>{p.nom} — {p.fonction}</option>)}
                    </select>
                  )}
                </div>
                {q.absentsAnnuaire.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Également connus pour ce rôle dans les documents GSS, mais absents de l'annuaire : {q.absentsAnnuaire.join(", ")}. Ajoutez-les dans Administration → Annuaire pour pouvoir leur écrire.
                  </p>
                )}
                {!coches.length && <p className="text-xs text-destructive">Aucun destinataire : cette question ne sera pas envoyée.</p>}
              </div>
            );
          })}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreparation(null)}>Annuler</Button>
            <Button size="sm" className="gap-1" disabled={envoi || !Object.values(choix).some((l) => l.length)} onClick={envoyerQuestions}>
              {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer les questions
            </Button>
          </div>
        </div>
      )}

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
            <iframe key={`${etat.fichier}#${pageLibre || ""}`} src={pageLibre ? `${url}#page=${pageLibre}` : url} className="h-[760px] w-full rounded-md border border-border" title="Aperçu du mémoire" />
          )}
        </div>

        <aside className="max-h-[820px] space-y-3 overflow-y-auto border-t border-border bg-muted/10 p-4 lg:border-l lg:border-t-0">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs font-medium">
            {([["completer", `À compléter (${groupesOuverts.length})`], ["assistant", "Assistant"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setOnglet(k)}
                className={cn("flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 transition-colors", onglet === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {k === "assistant" && <MessagesSquare className="h-3.5 w-3.5" />}
                {l}
              </button>
            ))}
          </div>

          {onglet === "assistant" && (
            <div
              className="relative space-y-3"
              onDragOver={(ev) => { if (ev.dataTransfer.types.includes("Files")) { ev.preventDefault(); setSurvolDepot(true); } }}
              onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setSurvolDepot(false); }}
              onDrop={(ev) => { ev.preventDefault(); setSurvolDepot(false); if (ev.dataTransfer.files?.length) ajouterPieces(ev.dataTransfer.files); }}
            >
              {survolDepot && (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
                  <Upload className="h-6 w-6" />
                  Déposez vos photos ou documents ici
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Demandez une modification en langage naturel : refaire ou corriger une partie, la développer ou la raccourcir, ajouter des pages.
                {etat.mode === "cadre" ? " Le texte du cadre de l'acheteur n'est jamais modifié ; les pages ajoutées vont en annexe." : ""}
              </p>
              {!(etat.conversation || []).length && !enAttenteAssistant && (
                <div className="space-y-1.5">
                  {EXEMPLES_ASSISTANT[etat.court ? "court" : etat.mode].map((ex) => (
                    <button key={ex} type="button" onClick={() => setMessage(ex)} className="w-full rounded-md border border-dashed border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
                      {ex}
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {(etat.conversation || []).map((m, i) => (
                  <div key={i} className={cn("rounded-lg px-3 py-2 text-sm", m.role === "utilisateur" ? "ml-6 bg-primary text-primary-foreground" : "mr-6 border border-border bg-card text-foreground")}>
                    <p className="whitespace-pre-line">{m.texte}</p>
                    {!!m.pieces?.length && (
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs opacity-90">
                        <Paperclip className="h-3 w-3" /> {m.pieces.join(", ")}
                      </p>
                    )}
                    {m.role === "assistant" && !!m.modifies?.length && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" /> Document mis à jour</p>
                    )}
                  </div>
                ))}
                {enAttenteAssistant && (
                  <>
                    <div className="ml-6 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"><p className="whitespace-pre-line">{enAttenteAssistant}</p></div>
                    <div className="mr-6 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {etat.mode === "libre" ? "Modification en cours, puis mise à jour du PDF…" : "Modification en cours…"}
                    </div>
                  </>
                )}
                <div ref={finConversationRef} />
              </div>
              {erreurAssistant && <p className="text-xs text-destructive">{erreurAssistant}</p>}
              <div className="space-y-2">
                {pieces.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pieces.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card py-1 pl-1 pr-2 text-xs">
                        {estImage(f) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={URL.createObjectURL(f)} alt="" className="h-7 w-7 rounded object-cover" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="max-w-[180px] truncate">{f.name}</span>
                        <button type="button" aria-label={`Retirer ${f.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => setPieces((p) => p.filter((_, j) => j !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  id="assistant-message"
                  value={message}
                  onChange={(ev) => setMessage(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); envoyerAssistant(); } }}
                  onPaste={(ev) => { if (ev.clipboardData.files?.length) { ev.preventDefault(); ajouterPieces(ev.clipboardData.files); } }}
                  rows={3}
                  placeholder="Ex. : Refais la partie sur les rondes en insistant sur la traçabilité…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex items-center justify-between gap-2">
                  <input
                    ref={entreePiecesRef}
                    id="assistant-pieces"
                    type="file"
                    multiple
                    accept={EXTENSIONS_PIECES.join(",")}
                    className="hidden"
                    onChange={(ev) => { if (ev.target.files?.length) ajouterPieces(ev.target.files); ev.target.value = ""; }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Joindre des photos ou des documents (ou glissez-les ici)"
                    aria-label="Joindre des photos ou des documents"
                    disabled={!!enAttenteAssistant}
                    onClick={() => entreePiecesRef.current?.click()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="flex-1 text-[11px] leading-tight text-muted-foreground">Photos ou documents : bouton + ou glisser-déposer</span>
                  <Button size="sm" className="gap-1" disabled={!!enAttenteAssistant || (!message.trim() && !pieces.length)} onClick={() => envoyerAssistant()}>
                    {enAttenteAssistant ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Envoyer
                  </Button>
                </div>
              </div>
            </div>
          )}

          {onglet === "completer" && (<>
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
          </>)}
        </aside>
      </div>
    </Card>
  );
}
