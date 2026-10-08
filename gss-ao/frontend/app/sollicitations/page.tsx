"use client";

// ════════════════════════════════════════════════════════════════════════════════════════
// Phase 4 — Interface minimale « Sollicitation interne » (Ticket #3, §12)
// ════════════════════════════════════════════════════════════════════════════════════════
// Liste des questions_interne d'un dossier (statut TEMPS RÉEL via Realtime), bouton « Envoyer
// une question de test », affichage de la réponse reçue + action « Valider ».
// Branché sur le modèle réel du ticket #2 : client @/lib/supabase/client, table `dossiers`,
// isolation par utilisateur (la RLS ne renvoie que MES questions ; « Valider » = propriétaire
// de l'AO = responsable §11.8, la RLS réserve la mise à jour au propriétaire/admin).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Send, RefreshCw, Mail, Inbox, Sparkles, ChevronDown, ChevronUp, FolderOpen, LockKeyhole, UserRound, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Button, Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui";
import { QuestionCard } from "@/components/question-card";
import {
  CRITICITE_LABEL, CRITICITE_OPTIONS, learnReponsesRecues, parseDestinataires,
  type QuestionInterne, type Dossier,
} from "@/lib/sollicitations";
import { apiFetch } from "@/lib/api";
import { EtatVide } from "@/components/visuel/etat-vide";
import { SqueletteCartes } from "@/components/visuel/squelette";

export default function SollicitationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [aoId, setAoId] = useState<string>("");
  const [questions, setQuestions] = useState<QuestionInterne[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Pré-remplissage depuis « Demander à l'équipe » (params d'URL ao / critere / question).
  const [prefill, setPrefill] = useState<Partial<SendForm> | null>(null);

  // Au montage (client only) : présélectionne le dossier (param court `ao`) et récupère le
  // pré-remplissage déposé par « Demander à l'équipe » dans sessionStorage (le corps du message
  // ne transite PAS par l'URL — trop long → HTTP 431). Lecture one-shot, puis on nettoie.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ao = sp.get("ao");
    if (ao) setAoId(ao);
    try {
      const raw = sessionStorage.getItem("gss_ask_team_prefill");
      if (raw) {
        const data = JSON.parse(raw) as { aoId?: string; critere?: string; question?: string };
        if (data.aoId) setAoId(data.aoId);
        setPrefill({ question: data.question || "", critere_concerne: data.critere || "" });
        sessionStorage.removeItem("gss_ask_team_prefill");
      }
    } catch {
      /* prefill indisponible/corrompu : formulaire vide, pas bloquant. */
    }
  }, []);

  // ── Session ────────────────────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUserEmail(data.user?.email ?? null);
    setReady(true);
  }, [supabase]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // ── Dossiers (RLS : uniquement les miens) ───────────────────────────────────────
  const loadDossiers = useCallback(async () => {
    if (!userEmail) return;
    const { data } = await supabase
      .from("dossiers")
      .select("id, nom, contenu")
      .order("created_at", { ascending: false });
    setDossiers((data as Dossier[]) ?? []);
    if (data && data.length && !aoId) setAoId(data[0].id);
  }, [supabase, userEmail, aoId]);

  useEffect(() => { loadDossiers(); }, [loadDossiers]);

  const loadQuestions = useCallback(async () => {
    if (!aoId) { setQuestions([]); return; }
    const { data } = await supabase
      .from("question_interne")
      .select("*")
      .eq("ao_id", aoId)
      .order("created_at", { ascending: false });
    setQuestions((data as QuestionInterne[]) ?? []);
  }, [supabase, aoId]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  // Apprentissage RAG des réponses reçues : le Realtime ci-dessous recharge `questions` dès
  // qu'une réponse arrive → l'indexation part sans attendre un passage par la boîte de réception.
  useEffect(() => { learnReponsesRecues(questions, apiFetch); }, [questions]);

  // ── Realtime : statut en temps réel (§12) ──────────────────────────────────────
  useEffect(() => {
    if (!aoId) return;
    const channel = supabase
      .channel(`qi-${aoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_interne", filter: `ao_id=eq.${aoId}` },
        () => loadQuestions(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, aoId, loadQuestions]);

  // ── Actions ────────────────────────────────────────────────────────────────────
  async function sendTest(form: SendForm) {
    if (!aoId) return;
    setErr(null); setMsg(null);

    // Un envoi PAR destinataire (point 7 des retours GSS). Chacun obtient ainsi son propre
    // question_id, donc sa réponse se rattache à SA ligne et n'écrase pas celle d'un collègue.
    // Même motif que /sollicitations/nouveau : 1 invoke = 1 question_id.
    const destinataires = parseDestinataires(form.destinataire_email);
    if (destinataires.length === 0) {
      setErr("Aucune adresse de destinataire valide.");
      return;
    }

    const echecs: string[] = [];
    let replyTo: string | undefined;
    let dryRun = false;

    for (const destinataire of destinataires) {
      const { data, error } = await supabase.functions.invoke("send-question", {
        body: { ao_id: aoId, ...form, destinataire_email: destinataire },
      });
      if (error || (data as any)?.error) {
        console.error("sendTest error:", destinataire, error ?? (data as any)?.error);
        echecs.push(`${destinataire} (${error?.message ?? String((data as any)?.error)})`);
        continue;
      }
      replyTo = (data as any)?.email?.replyTo;
      dryRun = !!(data as any)?.send?.dryRun;
    }

    const envoyees = destinataires.length - echecs.length;
    if (echecs.length > 0) {
      setErr(`Échec pour ${echecs.length} destinataire(s) : ${echecs.join(" ; ")}`);
    }
    if (envoyees > 0) {
      const cible = envoyees === 1 ? destinataires[0] : `${envoyees} destinataires`;
      // Le nom du fournisseur d'e-mail est de la plomberie : il n'apprend rien au salarié.
      // Le cas DRY-RUN garde sa mention explicite, c'est la seule distinction qui compte.
      setMsg(
        dryRun
          ? `Question créée pour ${cible}. Envoi en DRY-RUN (aucun fournisseur e-mail configuré).`
          : `Question envoyée à ${cible}.` +
            (envoyees === 1 && replyTo ? ` Reply-To : ${replyTo}` : ""),
      );
    }
    await loadQuestions();
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (!ready) return <Shell><p className="text-sm text-muted-foreground">Chargement…</p><SqueletteCartes nombre={2} className="mt-4" /></Shell>;

  if (!userEmail) {
    return (
      <Shell>
        <Card className="animate-monter">
          <CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole aria-hidden="true" className="h-[18px] w-[18px] text-primary" />Connexion requise</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Connectez-vous pour accéder aux sollicitations.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5 flex animate-monter items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-o1">
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
          <UserRound className="h-4 w-4" />
        </span>
        <span className="min-w-0 truncate">Connecté : <span className="font-medium text-foreground">{userEmail}</span></span>
      </div>

      {/* Sélecteur de dossier (AO) */}
      <Card className="mb-5 animate-monter">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-[15px]"><FolderOpen aria-hidden="true" className="h-[18px] w-[18px] text-primary" />Dossier (appel d'offres)</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadQuestions}><RefreshCw /> Rafraîchir</Button>
            {/* Accès à l'historique complet, filtré sur le dossier courant. */}
            <Link href={aoId ? `/inbox?ao=${aoId}` : "/inbox"}>
              <Button variant="outline" size="sm"><Inbox className="size-4" /> Historique</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {dossiers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#B9C5D4] bg-[#FAFBFC] px-4 py-3 text-sm text-muted-foreground">Aucun dossier. Créez-en un depuis l'onglet Dossiers.</p>
          ) : (
            <select
              className="h-10 w-full rounded-[9px] border border-input bg-card px-3 text-sm shadow-o1 transition-[border-color,box-shadow] hover:border-[#B9C5D4]"
              value={aoId}
              onChange={(e) => setAoId(e.target.value)}
            >
              {dossiers.map((d) => (
                <option key={d.id} value={d.id}>{d.nom}</option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {msg && <Banner kind="ok" text={msg} />}
      {err && <Banner kind="err" text={err} />}

      {/* Formulaire d'envoi (pré-rempli si arrivé depuis « Demander à l'équipe ») */}
      {aoId && (
        <SendFormCard
          key={prefill ? "prefilled" : "empty"}
          onSubmit={sendTest}
          initial={prefill ?? undefined}
        />
      )}

      {/* Liste des questions */}
      <div className="mt-7 space-y-3">
        <h2 className="flex items-center gap-2 border-b border-border pb-2.5 text-[15px] font-semibold text-foreground">
          <Inbox className="size-[18px] text-primary" /> Questions internes ({questions.length})
        </h2>
        {questions.length === 0 && (
          <EtatVide icone={MessageSquareText} pointilles>
            <p className="text-[15px] font-semibold text-foreground">Aucune question pour ce dossier.</p>
          </EtatVide>
        )}
        <div className="apparait space-y-3">
          {questions.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      </div>
    </Shell>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[960px] px-4 pb-10 pt-6 md:px-9 md:pt-[30px]">
      <h1 className="mb-1 flex animate-monter items-center gap-3 font-display text-[26px] font-bold leading-[1.1] text-foreground md:text-[28px]">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-o1">
          <Mail className="size-5" />
        </span>
        Sollicitation interne
      </h1>
      <p className="mb-6 animate-monter text-sm text-muted-foreground md:pl-[52px]">
        Posez une question à vos collègues par e-mail. Leur réponse est automatiquement rattachée au dossier.
      </p>
      {children}
    </div>
  );
}

function Banner({ kind, text }: { kind: "ok" | "err"; text: string }) {
  return (
    <div className={`mt-3 mb-4 animate-monter rounded-xl border p-3 text-sm ${
      kind === "ok" ? "border-success/30 bg-success-soft text-success" : "border-destructive/30 bg-destructive-soft text-destructive"
    }`}>{text}</div>
  );
}

interface SendForm {
  destinataire_email: string;
  destinataire_nom?: string;
  critere_concerne: string;
  categorie?: string;
  niveau_criticite: string;
  question: string;
  date_limite?: string;
}

/** Une personne proposée par l'IA pour répondre à la question (retours GSS, points 2 et 3). */
interface Suggestion {
  id: string;
  nom: string;
  fonction: string;
  email: string;
  raison: string;
  recommande: boolean;
}

function SendFormCard({ onSubmit, initial }: { onSubmit: (f: SendForm) => void; initial?: Partial<SendForm> }) {
  const [f, setF] = useState<SendForm>({
    destinataire_email: "", destinataire_nom: "", critere_concerne: "",
    categorie: "", niveau_criticite: "interne", question: "", date_limite: "",
    ...initial,
  });
  const set = (k: keyof SendForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  // Adresses comprises par le champ : affichées en pastilles pour que l'utilisateur VOIE qui
  // va recevoir avant d'envoyer. Une seule adresse => comportement identique à l'existant.
  const destinataires = useMemo(() => parseDestinataires(f.destinataire_email), [f.destinataire_email]);
  const disabled = destinataires.length === 0 || !f.critere_concerne || !f.question;

  function retirerDestinataire(adresse: string) {
    setF((p) => ({
      ...p,
      destinataire_email: parseDestinataires(p.destinataire_email)
        .filter((d) => d.toLowerCase() !== adresse.toLowerCase())
        .join(", "),
    }));
  }

  // ── Suggestion des destinataires par l'IA (points 2 et 3 des retours GSS) ─────────────
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggEnCours, setSuggEnCours] = useState(false);
  const [suggMotif, setSuggMotif] = useState<string | null>(null);
  const [suggOuvert, setSuggOuvert] = useState(false);
  const [voirPlus, setVoirPlus] = useState(false);

  // Si la question change, les suggestions ne la concernent plus : on les efface plutôt que
  // d'afficher des propositions calculées pour un autre texte.
  useEffect(() => {
    setSuggestions(null);
    setSuggOuvert(false);
    setVoirPlus(false);
  }, [f.question]);

  /** Coche ou décoche une personne : son adresse est simplement ajoutée ou retirée du champ
   *  destinataires, qui reste la seule source de vérité. Les pastilles suivent d'elles-mêmes. */
  function basculerDestinataire(adresse: string, coche: boolean) {
    setF((p) => {
      const sans = parseDestinataires(p.destinataire_email).filter(
        (d) => d.toLowerCase() !== adresse.toLowerCase(),
      );
      return { ...p, destinataire_email: (coche ? [...sans, adresse] : sans).join(", ") };
    });
  }

  async function chercherDestinataires() {
    setSuggEnCours(true);
    setSuggMotif(null);
    try {
      const res = await apiFetch("/api/sollicitations/suggest-destinataires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: f.question, critere_concerne: f.critere_concerne }),
      });
      const data = await res.json();
      const liste: Suggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
      setSuggestions(liste);
      setSuggMotif(data?.motif ?? null);
      setSuggOuvert(true);
      setVoirPlus(false);
      // Aucune case n'est cochée d'avance : le choix du destinataire reste un acte délibéré.
    } catch {
      setSuggestions([]);
      setSuggMotif("suggestion_indisponible");
    } finally {
      setSuggEnCours(false);
    }
  }
  return (
    <Card className="animate-monter">
      <CardHeader><CardTitle className="flex items-center gap-2 text-[15px]"><Send aria-hidden="true" className="h-[18px] w-[18px] text-primary" />Envoyer une question à l'équipe</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="input" placeholder="Destinataires (emails séparés par une virgule) *" value={f.destinataire_email} onChange={set("destinataire_email")} />
        <input className="input" placeholder="Destinataire (nom)" value={f.destinataire_nom} onChange={set("destinataire_nom")} />
        {destinataires.length > 0 && (
          <div className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {destinataires.map((d) => (
                <span
                  key={d}
                  className="inline-flex animate-zoom-doux items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {d}
                  <button
                    type="button"
                    aria-label={`Retirer ${d}`}
                    className="grid h-4 w-4 place-items-center rounded-full leading-none text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                    onClick={() => retirerDestinataire(d)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {destinataires.length === 1
                ? "1 destinataire."
                : `${destinataires.length} destinataires · chacun recevra le même message et pourra répondre de son côté.`}
            </p>
          </div>
        )}
        <input className="input sm:col-span-2" placeholder="Critère concerné *" value={f.critere_concerne} onChange={set("critere_concerne")} />
        <input className="input" placeholder="Catégorie" value={f.categorie} onChange={set("categorie")} />
        <select className="input" value={f.niveau_criticite} onChange={set("niveau_criticite")}>
          {CRITICITE_OPTIONS.map((c) => <option key={c} value={c}>{CRITICITE_LABEL[c]}</option>)}
        </select>
        <input className="input sm:col-span-2" type="date" value={f.date_limite} onChange={set("date_limite")} />
        <textarea className="input sm:col-span-2" rows={3} placeholder="Question *" value={f.question} onChange={set("question")} />

        {/* Suggestion des destinataires (points 2 et 3 des retours GSS). L'IA propose, l'utilisateur
            dispose : cocher ou décocher met simplement à jour le champ destinataires ci-dessus. */}
        <div className="sm:col-span-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!f.question.trim() || suggEnCours}
            onClick={() => (suggestions ? setSuggOuvert((o) => !o) : chercherDestinataires())}
          >
            {suggestions ? (
              suggOuvert ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}{" "}
            {suggEnCours ? "Recherche…" : "Qui peut répondre ?"}
          </Button>
          {!f.question.trim() && (
            <span className="ml-2 text-xs text-muted-foreground">Écrivez d'abord la question.</span>
          )}

          {suggOuvert && suggestions && suggestions.length > 0 && (
            <ul className="apparait mt-3 space-y-2">
              {(voirPlus ? suggestions : suggestions.slice(0, 3)).map((sug) => {
                const coche = destinataires.some((d) => d.toLowerCase() === sug.email.toLowerCase());
                return (
                  <li key={sug.id}>
                    <label className={`vive flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${coche ? "border-primary/40 bg-secondary" : "border-border bg-card"}`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={coche}
                        onChange={(e) => basculerDestinataire(sug.email, e.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className="text-sm font-medium">{sug.nom}</span>
                        <span className="text-sm text-muted-foreground"> — {sug.fonction}</span>
                        {sug.recommande && (
                          <span className="ml-2 rounded-full bg-signal-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal-texte">
                            Recommandé
                          </span>
                        )}
                        {sug.raison && (
                          <span className="block text-xs text-muted-foreground">{sug.raison}</span>
                        )}
                        <span className="block text-xs text-muted-foreground">{sug.email}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Les personnes suivantes restent pertinentes, mais moins directement concernées.
              Le moteur ne complète jamais la liste pour atteindre un quota : s'il n'a trouvé que
              deux personnes utiles, ce bouton n'apparaît pas. */}
          {suggOuvert && suggestions && suggestions.length > 3 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setVoirPlus((v) => !v)}
            >
              {voirPlus
                ? "Voir moins"
                : `Voir ${suggestions.length - 3} autre${suggestions.length - 3 > 1 ? "s" : ""} personne${suggestions.length - 3 > 1 ? "s" : ""}`}
            </Button>
          )}

          {suggOuvert && suggestions && suggestions.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {suggMotif === "annuaire_vide"
                ? "L'annuaire des collaborateurs est vide : ajoutez-y des personnes depuis Administration pour activer les suggestions."
                : "Aucune suggestion pour le moment. Saisissez les adresses à la main, comme d'habitude."}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <Button disabled={disabled} onClick={() => onSubmit(f)}>
            <Send />{" "}
            {destinataires.length > 1
              ? `Envoyer la question à ${destinataires.length} personnes`
              : "Envoyer la question"}
          </Button>
        </div>
      </CardContent>
      <style jsx>{`
        .input { width: 100%; min-height: 40px; border-radius: 9px; border: 1px solid hsl(var(--input));
          background: hsl(var(--card)); padding: 0.5rem 0.8rem; font-size: 0.875rem;
          box-shadow: 0 1px 2px rgba(16,32,58,.06), 0 1px 1px rgba(16,32,58,.04);
          transition: border-color .15s cubic-bezier(.2,.7,.2,1), box-shadow .15s cubic-bezier(.2,.7,.2,1); }
        .input:hover { border-color: #B9C5D4; }
      `}</style>
    </Card>
  );
}

