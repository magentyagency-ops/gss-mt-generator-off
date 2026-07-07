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
import { Send, CheckCircle2, RefreshCw, Mail, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui";
import {
  STATUT_LABEL, STATUT_BADGE, CRITICITE_LABEL, CRITICITE_OPTIONS,
  type QuestionInterne, type Dossier,
} from "@/lib/sollicitations";

export default function SollicitationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [aoId, setAoId] = useState<string>("");
  const [questions, setQuestions] = useState<QuestionInterne[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
  async function createTestDossier() {
    setErr(null);
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    // user_id = auth.uid() (défaut en base). On stocke une « reference » dans contenu (§11).
    const ref = `AO-TEST-${String(Date.now()).slice(-5)}`;
    const { error } = await supabase.from("dossiers").insert({
      nom: `Marché de test (${stamp})`,
      contenu: { reference: ref, objet: `Marché de test (${stamp})` },
    });
    if (error) setErr(error.message); else await loadDossiers();
  }

  async function sendTest(form: SendForm) {
    if (!aoId) return;
    setErr(null); setMsg(null);
    const { data, error } = await supabase.functions.invoke("send-question", {
      body: { ao_id: aoId, ...form },
    });
    if (error) { setErr(error.message); return; }
    const send = (data as any)?.send;
    const replyTo = (data as any)?.email?.replyTo;
    setMsg(
      send?.dryRun
        ? `Question créée. Envoi en DRY-RUN (aucun fournisseur e-mail configuré). Reply-To : ${replyTo}`
        : `Question envoyée via ${send?.provider}. Reply-To : ${replyTo}`,
    );
    await loadQuestions();
  }

  async function valider(q: QuestionInterne) {
    setErr(null);
    const { error } = await supabase
      .from("question_interne")
      .update({ statut: "validee" })
      .eq("id", q.id);
    if (error) setErr(error.message); else await loadQuestions();
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (!ready) return <Shell><p className="text-sm text-muted-foreground">Chargement…</p></Shell>;

  if (!userEmail) {
    return (
      <Shell>
        <Card>
          <CardHeader><CardTitle>Connexion requise</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Connectez-vous pour accéder aux sollicitations (auth du ticket #2).
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-4 text-sm text-muted-foreground">
        Connecté : <span className="font-medium text-foreground">{userEmail}</span>
      </div>

      {/* Sélecteur de dossier (AO) */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Dossier (appel d'offres)</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadQuestions}><RefreshCw /> Rafraîchir</Button>
            <Button variant="outline" size="sm" onClick={createTestDossier}>+ Dossier de test</Button>
          </div>
        </CardHeader>
        <CardContent>
          {dossiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun dossier. Créez-en un de test ci-dessus.</p>
          ) : (
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

      {/* Formulaire d'envoi de test */}
      {aoId && <SendFormCard onSubmit={sendTest} />}

      {/* Liste des questions */}
      <div className="mt-6 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Inbox className="size-4" /> Questions internes ({questions.length})
        </h2>
        {questions.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune question pour ce dossier.</p>
        )}
        {questions.map((q) => (
          <QuestionCard key={q.id} q={q} onValider={() => valider(q)} />
        ))}
      </div>
    </Shell>
  );
}

// ── Sous-composants ──────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <Mail className="size-5" /> Sollicitation interne
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Envoi d'une question interne par e-mail et rattachement automatique de la réponse au dossier (spike, une question).
      </p>
      {children}
    </div>
  );
}

function Banner({ kind, text }: { kind: "ok" | "err"; text: string }) {
  return (
    <div className={`mt-3 rounded-md border p-3 text-sm ${
      kind === "ok" ? "border-success bg-success/10" : "border-destructive bg-destructive/10"
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

function SendFormCard({ onSubmit }: { onSubmit: (f: SendForm) => void }) {
  const [f, setF] = useState<SendForm>({
    destinataire_email: "", destinataire_nom: "", critere_concerne: "",
    categorie: "", niveau_criticite: "interne", question: "", date_limite: "",
  });
  const set = (k: keyof SendForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const disabled = !f.destinataire_email || !f.critere_concerne || !f.question;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Envoyer une question de test</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="input" placeholder="Destinataire (email) *" value={f.destinataire_email} onChange={set("destinataire_email")} />
        <input className="input" placeholder="Destinataire (nom)" value={f.destinataire_nom} onChange={set("destinataire_nom")} />
        <input className="input sm:col-span-2" placeholder="Critère concerné *" value={f.critere_concerne} onChange={set("critere_concerne")} />
        <input className="input" placeholder="Catégorie" value={f.categorie} onChange={set("categorie")} />
        <select className="input" value={f.niveau_criticite} onChange={set("niveau_criticite")}>
          {CRITICITE_OPTIONS.map((c) => <option key={c} value={c}>{CRITICITE_LABEL[c]}</option>)}
        </select>
        <input className="input sm:col-span-2" type="date" value={f.date_limite} onChange={set("date_limite")} />
        <textarea className="input sm:col-span-2" rows={3} placeholder="Question *" value={f.question} onChange={set("question")} />
        <div className="sm:col-span-2">
          <Button disabled={disabled} onClick={() => onSubmit(f)}><Send /> Envoyer la question</Button>
        </div>
      </CardContent>
      <style jsx>{`
        .input { width: 100%; border-radius: 0.375rem; border: 1px solid hsl(var(--input));
          background: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.875rem; }
      `}</style>
    </Card>
  );
}

function QuestionCard({ q, onValider }: { q: QuestionInterne; onValider: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={STATUT_BADGE[q.statut]}>{STATUT_LABEL[q.statut]}</Badge>
          <code className="text-xs text-muted-foreground">{q.question_id}</code>
        </div>
        <div className="text-sm"><span className="text-muted-foreground">Critère : </span>{q.critere_concerne}</div>
        <div className="text-sm"><span className="text-muted-foreground">Destinataire : </span>{q.destinataire_nom ? `${q.destinataire_nom} · ` : ""}{q.destinataire_email}</div>
        <div className="text-sm"><span className="text-muted-foreground">Question : </span>{q.question}</div>
        {q.date_limite && <div className="text-xs text-muted-foreground">Date limite : {q.date_limite}</div>}

        {q.statut === "reponse_recue" && (
          <div className="mt-2 rounded-md border border-success bg-success/10 p-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Réponse reçue</div>
            <div className="whitespace-pre-wrap text-sm">{q.reponse_contenu}</div>
            {/* La RLS réserve la mise à jour au propriétaire de l'AO (responsable §11.8) / admin. */}
            <Button className="mt-2" size="sm" onClick={onValider}><CheckCircle2 /> Valider</Button>
          </div>
        )}
        {q.statut === "validee" && (
          <div className="mt-2 rounded-md border border-input p-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Réponse validée</div>
            <div className="whitespace-pre-wrap text-sm">{q.reponse_contenu}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
