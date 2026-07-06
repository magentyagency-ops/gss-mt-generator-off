"use client";

// ════════════════════════════════════════════════════════════════════════════════════════
// Phase 4 — Interface minimale « Sollicitation interne » (Ticket #3, §12)
// ════════════════════════════════════════════════════════════════════════════════════════
// Vue simple : liste des questions_interne d'un dossier (statut TEMPS RÉEL via Realtime),
// bouton « Envoyer une question de test », affichage de la réponse reçue + action « Valider »
// (réservée au responsable). S'appuie sur la RLS : l'utilisateur ne voit que son organisation.
//
// NB spike : auth Supabase minimale (email/mot de passe) pour porter le JWT et donc la RLS.
// À réconcilier avec l'authentification du ticket #2 quand elle existera.

import { useCallback, useEffect, useState } from "react";
import { Send, CheckCircle2, RefreshCw, Mail, AlertTriangle, Inbox } from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui";
import {
  getSupabase, STATUT_LABEL, STATUT_BADGE, CRITICITE_LABEL, CRITICITE_OPTIONS,
  type QuestionInterne, type AppelOffres,
} from "@/lib/sollicitations";

export default function SollicitationsPage() {
  const supabase = getSupabase();
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [aos, setAos] = useState<AppelOffres[]>([]);
  const [aoId, setAoId] = useState<string>("");
  const [questions, setQuestions] = useState<QuestionInterne[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    setUserEmail(data.user?.email ?? null);
    if (data.user) {
      const { data: m } = await supabase
        .from("organisation_membre")
        .select("organisation_id, role")
        .limit(1)
        .maybeSingle();
      setOrgId(m?.organisation_id ?? null);
      setRole(m?.role ?? null);
    }
    setReady(true);
  }, [supabase]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // ── Chargement des AO puis des questions ───────────────────────────────────────
  const loadAos = useCallback(async () => {
    if (!supabase || !userEmail) return;
    const { data } = await supabase
      .from("appel_offres")
      .select("id, organisation_id, reference, nom_marche")
      .order("created_at", { ascending: false });
    setAos(data ?? []);
    if (data && data.length && !aoId) setAoId(data[0].id);
  }, [supabase, userEmail, aoId]);

  useEffect(() => { loadAos(); }, [loadAos]);

  const loadQuestions = useCallback(async () => {
    if (!supabase || !aoId) { setQuestions([]); return; }
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
    if (!supabase || !aoId) return;
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
  async function signIn(email: string, password: string) {
    if (!supabase) return;
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    else await loadSession();
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setUserEmail(null); setOrgId(null); setRole(null); setAos([]); setQuestions([]);
  }

  async function createTestAo() {
    if (!supabase || !orgId) return;
    setErr(null);
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const { error } = await supabase.from("appel_offres").insert({
      organisation_id: orgId,
      reference: `AO-TEST-${Math.floor(Number(new Date()) % 100000)}`,
      nom_marche: `Marché de test (${stamp})`,
    });
    if (error) setErr(error.message); else await loadAos();
  }

  async function sendTest(form: SendForm) {
    if (!supabase || !aoId) return;
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
    if (!supabase) return;
    setErr(null);
    const { error } = await supabase
      .from("question_interne")
      .update({ statut: "validee" })
      .eq("id", q.id);
    if (error) setErr(error.message); else await loadQuestions();
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (!supabase) {
    return (
      <Shell>
        <Card>
          <CardHeader><CardTitle>Configuration requise</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Variables <code>NEXT_PUBLIC_SUPABASE_URL</code> / <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            manquantes. Copier <code>frontend/.env.local.example</code> → <code>.env.local</code>.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (!ready) return <Shell><p className="text-sm text-muted-foreground">Chargement…</p></Shell>;

  if (!userEmail) return <Shell><SignIn onSignIn={signIn} err={err} /></Shell>;

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          Connecté : <span className="font-medium text-foreground">{userEmail}</span>
          {role && <> · rôle <Badge variant="outline">{role}</Badge></>}
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>Se déconnecter</Button>
      </div>

      {!orgId && (
        <Card className="mb-4 border-warning">
          <CardContent className="flex items-center gap-2 py-3 text-sm">
            <AlertTriangle className="text-warning" />
            Aucune organisation rattachée à ce compte. (À seeder côté base — voir README.)
          </CardContent>
        </Card>
      )}

      {/* Sélecteur de dossier (AO) */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Dossier (appel d'offres)</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadQuestions}><RefreshCw /> Rafraîchir</Button>
            {orgId && <Button variant="outline" size="sm" onClick={createTestAo}>+ AO de test</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {aos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun appel d'offres. {orgId ? "Créez-en un de test ci-dessus." : ""}
            </p>
          ) : (
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={aoId}
              onChange={(e) => setAoId(e.target.value)}
            >
              {aos.map((ao) => (
                <option key={ao.id} value={ao.id}>{ao.reference} — {ao.nom_marche}</option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {msg && <Banner kind="ok" text={msg} />}
      {err && <Banner kind="err" text={err} />}

      {/* Formulaire d'envoi de test */}
      {aoId && <SendForm onSubmit={sendTest} />}

      {/* Liste des questions */}
      <div className="mt-6 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Inbox className="size-4" /> Questions internes ({questions.length})
        </h2>
        {questions.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune question pour ce dossier.</p>
        )}
        {questions.map((q) => (
          <QuestionCard key={q.id} q={q} canValidate={role === "responsable"} onValider={() => valider(q)} />
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

function SignIn({ onSignIn, err }: { onSignIn: (e: string, p: string) => void; err: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle>Connexion (spike)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Auth Supabase minimale pour porter la RLS. Utilisez un compte de test créé sur le projet.
        </p>
        <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button onClick={() => onSignIn(email, password)}>Se connecter</Button>
      </CardContent>
    </Card>
  );
}

interface SendForm {
  destinataire_email: string;
  destinataire_nom?: string;
  critere_concerne: string;
  niveau_criticite: string;
  question: string;
  date_limite?: string;
}

function SendForm({ onSubmit }: { onSubmit: (f: SendForm) => void }) {
  const [f, setF] = useState<SendForm>({
    destinataire_email: "", destinataire_nom: "", critere_concerne: "",
    niveau_criticite: "interne", question: "", date_limite: "",
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
        <select className="input" value={f.niveau_criticite} onChange={set("niveau_criticite")}>
          {CRITICITE_OPTIONS.map((c) => <option key={c} value={c}>{CRITICITE_LABEL[c]}</option>)}
        </select>
        <input className="input" type="date" value={f.date_limite} onChange={set("date_limite")} />
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

function QuestionCard({ q, canValidate, onValider }: {
  q: QuestionInterne; canValidate: boolean; onValider: () => void;
}) {
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
            {canValidate ? (
              <Button className="mt-2" size="sm" onClick={onValider}><CheckCircle2 /> Valider</Button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Validation réservée au responsable.</p>
            )}
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
