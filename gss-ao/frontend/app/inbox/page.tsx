"use client";

// ════════════════════════════════════════════════════════════════════════════════════════
// Phase 1 — Boîte de réception globale (Ticket #3)
// ════════════════════════════════════════════════════════════════════════════════════════
// Liste TOUTES les sollicitations de l'utilisateur, tous dossiers confondus, avec statut et
// réponse reçue (statut TEMPS RÉEL via Realtime). Réutilise la requête + l'abonnement de
// app/sollicitations/page.tsx SANS filtre `ao_id` : la RLS ne renvoie déjà que MES questions.
// Aucun changement backend / Edge Function / migration : lecture pure via @/lib/supabase/client.

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { QuestionCard } from "@/components/question-card";
import { type QuestionInterne, type Dossier } from "@/lib/sollicitations";

export default function InboxPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionInterne[]>([]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // ── Session ────────────────────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUserEmail(data.user?.email ?? null);
    setReady(true);
  }, [supabase]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // ── Dossiers (RLS : uniquement les miens) — pour rappeler le nom par ligne ───────
  const loadDossiers = useCallback(async () => {
    if (!userEmail) return;
    const { data } = await supabase.from("dossiers").select("id, nom, contenu");
    setDossiers((data as Dossier[]) ?? []);
  }, [supabase, userEmail]);

  useEffect(() => { loadDossiers(); }, [loadDossiers]);

  const dossierNomById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dossiers) m.set(d.id, d.nom);
    return m;
  }, [dossiers]);

  // ── Toutes mes questions (aucun filtre ao_id : la RLS isole déjà par utilisateur) ─
  const loadQuestions = useCallback(async () => {
    if (!userEmail) { setQuestions([]); return; }
    const { data, error } = await supabase
      .from("question_interne")
      .select("*")
      .order("reponse_recue_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) { setErr(error.message); return; }
    setQuestions((data as QuestionInterne[]) ?? []);
  }, [supabase, userEmail]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  // ── Realtime : statut en temps réel (§12), sur toutes MES questions ──────────────
  useEffect(() => {
    if (!userEmail) return;
    const channel = supabase
      .channel("qi-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_interne" },
        () => loadQuestions(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, userEmail, loadQuestions]);

  // ── Action « Valider » (RLS : réservé au propriétaire de l'AO / admin) ───────────
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
            Connectez-vous pour accéder à votre boîte de réception (auth du ticket #2).
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Connecté : <span className="font-medium text-foreground">{userEmail}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={loadQuestions}><RefreshCw /> Rafraîchir</Button>
      </div>

      {err && (
        <div className="mb-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">{err}</div>
      )}

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Inbox className="size-4" /> Toutes mes sollicitations ({questions.length})
        </h2>
        {questions.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune sollicitation pour le moment.</p>
        )}
        {questions.map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            onValider={() => valider(q)}
            dossierNom={dossierNomById.get(q.ao_id) ?? "Dossier inconnu"}
          />
        ))}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <Inbox className="size-5" /> Boîte de réception
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Toutes vos sollicitations internes, tous dossiers confondus, avec leur statut et la réponse reçue.
      </p>
      {children}
    </div>
  );
}
