"use client";

// ════════════════════════════════════════════════════════════════════════════════════════
// Phase 2a — Rédaction d'une sollicitation (envoi en lot) — Ticket #3
// ════════════════════════════════════════════════════════════════════════════════════════
// L'utilisateur rédige une sollicitation vers un destinataire (saisie libre) avec UNE ou
// PLUSIEURS questions. Chaque question part comme une ligne question_interne distincte via la
// fonction send-question existante : 1 question = 1 invoke = 1 question_id (clé de rattachement).
// Envoi SÉQUENTIEL, résultat rapporté ligne par ligne (aucune erreur masquée).
// Aucun changement backend / Edge Function / migration / table dossiers : lecture des dossiers +
// invoke de send-question uniquement (même contrat que SendFormCard de app/sollicitations/page.tsx).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Plus, Trash2, ArrowLeft, Mail, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { type Dossier } from "@/lib/sollicitations";

// Une ligne de question saisie dans le formulaire (avant envoi).
interface QuestionLine {
  critere_concerne: string;
  question: string;
}

// Résultat d'envoi d'une ligne (rapporté à l'utilisateur).
interface LineResult {
  index: number;
  ok: boolean;
  detail: string; // question_id / reply-to si OK, message d'erreur sinon
}

export default function NouvelleSollicitationPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [aoId, setAoId] = useState<string>("");

  const [destinataireEmail, setDestinataireEmail] = useState("");
  const [destinataireNom, setDestinataireNom] = useState("");
  const [lines, setLines] = useState<QuestionLine[]>([{ critere_concerne: "", question: "" }]);

  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<LineResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ── Session ────────────────────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUserEmail(data.user?.email ?? null);
    setReady(true);
  }, [supabase]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // ── Dossiers (RLS : uniquement les miens) — sélecteur ao_id, id+nom seulement ────
  const loadDossiers = useCallback(async () => {
    if (!userEmail) return;
    const { data } = await supabase
      .from("dossiers")
      .select("id, nom")
      .order("created_at", { ascending: false });
    const rows = (data as Dossier[]) ?? [];
    setDossiers(rows);
    if (rows.length && !aoId) setAoId(rows[0].id);
  }, [supabase, userEmail, aoId]);

  useEffect(() => { loadDossiers(); }, [loadDossiers]);

  // ── Manipulation des lignes de questions ────────────────────────────────────────
  function updateLine(i: number, key: keyof QuestionLine, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { critere_concerne: "", question: "" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  // Validité : dossier + email + au moins une ligne complète, et toute ligne saisie complète.
  const linesValid = lines.every((l) => l.critere_concerne.trim() && l.question.trim());
  const canSend = !!aoId && !!destinataireEmail.trim() && lines.length > 0 && linesValid && !sending;

  // ── Envoi séquentiel : 1 ligne = 1 invoke send-question = 1 question_id ──────────
  async function handleSend() {
    if (!canSend) return;
    setErr(null);
    setResults(null);
    setSending(true);

    const acc: LineResult[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      // Contrat EXACT de SendFormCard (app/sollicitations/page.tsx) : invoke send-question.
      const { data, error } = await supabase.functions.invoke("send-question", {
        body: {
          ao_id: aoId,
          destinataire_email: destinataireEmail.trim(),
          destinataire_nom: destinataireNom.trim() || undefined,
          critere_concerne: l.critere_concerne.trim(),
          question: l.question.trim(),
        },
      });

      if (error) {
        // Ne PAS masquer l'erreur : on remonte le message brut du fournisseur/fonction.
        acc.push({ index: i, ok: false, detail: error.message || "Échec de l'envoi" });
      } else if ((data as any)?.error) {
        acc.push({ index: i, ok: false, detail: String((data as any).error) });
      } else {
        const replyTo = (data as any)?.email?.replyTo;
        const qid = (data as any)?.question?.question_id;
        const send = (data as any)?.send;
        acc.push({
          index: i,
          ok: true,
          detail: `${send?.dryRun ? "DRY-RUN" : `envoyée via ${send?.provider}`} · ${qid ?? ""}${replyTo ? ` · ${replyTo}` : ""}`,
        });
      }
      setResults([...acc]); // MAJ progressive : l'utilisateur voit l'avancement.
    }

    setSending(false);
    // Tout OK → retour à la boîte de réception.
    if (acc.every((r) => r.ok)) {
      router.push("/inbox");
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (!ready) return <Shell><p className="text-sm text-muted-foreground">Chargement…</p></Shell>;

  if (!userEmail) {
    return (
      <Shell>
        <Card>
          <CardHeader><CardTitle>Connexion requise</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Connectez-vous pour rédiger une sollicitation (auth du ticket #2).
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      {err && <div className="mb-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">{err}</div>}

      {/* Dossier + destinataire */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Destinataire & dossier</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">Dossier (appel d'offres) *</label>
            {dossiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun dossier. Créez-en un depuis la page <Link href="/sollicitations" className="underline">Sollicitations</Link>.
              </p>
            ) : (
              <select className="input" value={aoId} onChange={(e) => setAoId(e.target.value)}>
                {dossiers.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Destinataire — email *</label>
            <input className="input" placeholder="prenom.nom@exemple.fr" value={destinataireEmail} onChange={(e) => setDestinataireEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Destinataire — nom</label>
            <input className="input" placeholder="(optionnel)" value={destinataireNom} onChange={(e) => setDestinataireNom(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Questions (liste dynamique) */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Questions ({lines.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={addLine}><Plus /> Ajouter une question</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((l, i) => (
            <div key={i} className="rounded-md border border-input p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Question {i + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLine(i)}
                  disabled={lines.length <= 1}
                  aria-label={`Supprimer la question ${i + 1}`}
                >
                  <Trash2 /> Supprimer
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <input
                  className="input"
                  placeholder="Critère concerné *"
                  value={l.critere_concerne}
                  onChange={(e) => updateLine(i, "critere_concerne", e.target.value)}
                />
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Question *"
                  value={l.question}
                  onChange={(e) => updateLine(i, "question", e.target.value)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Résultats par ligne */}
      {results && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Résultat de l'envoi</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {results.map((r) => (
              <div key={r.index} className="flex items-start gap-2 text-sm">
                {r.ok
                  ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                <span>
                  <span className="font-medium">Question {r.index + 1} : </span>
                  <span className={r.ok ? "text-muted-foreground" : "text-destructive"}>{r.detail}</span>
                </span>
              </div>
            ))}
            {results.some((r) => !r.ok) && (
              <p className="pt-1 text-xs text-muted-foreground">
                Certaines questions ont échoué : corrigez et renvoyez (les questions déjà parties ont créé leur ligne).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button disabled={!canSend} onClick={handleSend}>
          <Send /> {sending ? "Envoi en cours…" : `Envoyer ${lines.length > 1 ? `les ${lines.length} questions` : "la question"}`}
        </Button>
        <Link href="/inbox"><Button variant="ghost">Annuler</Button></Link>
      </div>

      <style jsx>{`
        .input { width: 100%; border-radius: 0.375rem; border: 1px solid hsl(var(--input));
          background: hsl(var(--background)); padding: 0.5rem 0.75rem; font-size: 0.875rem; }
      `}</style>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/inbox" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Retour à la boîte de réception
      </Link>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <Mail className="size-5" /> Rédiger une sollicitation
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Une ou plusieurs questions à un même destinataire. Chaque question crée une ligne de suivi indépendante et part par e-mail.
      </p>
      {children}
    </div>
  );
}
