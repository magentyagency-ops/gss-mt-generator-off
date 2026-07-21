"use client";

// ════════════════════════════════════════════════════════════════════════════════════════
// Phase 1 — Boîte de réception globale (Ticket #3)
// ════════════════════════════════════════════════════════════════════════════════════════
// Liste TOUTES les sollicitations de l'utilisateur, tous dossiers confondus, avec statut et
// réponse reçue (statut TEMPS RÉEL via Realtime). Réutilise la requête + l'abonnement de
// app/sollicitations/page.tsx SANS filtre `ao_id` : la RLS ne renvoie déjà que MES questions.
// Aucun changement backend / Edge Function / migration : lecture pure via @/lib/supabase/client.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Inbox, PenLine } from "lucide-react";
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

  // ── Regroupement par dossier (Cas A) ─────────────────────────────────────────────
  // À partir de la liste plate déjà chargée (RLS-scoped), on groupe par `ao_id`.
  //   • dans chaque groupe : ordre chronologique CROISSANT (created_at asc) → on lit le
  //     fil comme une conversation (question puis, sur la même carte, sa réponse) ;
  //   • entre les groupes : le dossier avec l'activité la plus RÉCENTE en premier
  //     (max de reponse_recue_at/created_at, décroissant).
  const groupes = useMemo(() => {
    const map = new Map<string, QuestionInterne[]>();
    for (const q of questions) {
      const arr = map.get(q.ao_id);
      if (arr) arr.push(q); else map.set(q.ao_id, [q]);
    }
    const activiteTime = (q: QuestionInterne) =>
      new Date(q.reponse_recue_at ?? q.created_at).getTime();
    const groups = Array.from(map.entries()).map(([aoId, items]) => ({
      aoId,
      items: [...items].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
      derniereActivite: Math.max(...items.map(activiteTime)),
    }));
    groups.sort((a, b) => b.derniereActivite - a.derniereActivite);
    return groups;
  }, [questions]);

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
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={loadQuestions}><RefreshCw /> Rafraîchir</Button>
          <Link href="/sollicitations/nouveau">
            <Button size="sm"><PenLine /> Rédiger une sollicitation</Button>
          </Link>
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">{err}</div>
      )}

      <div className="space-y-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Inbox className="size-4" /> Toutes mes sollicitations ({questions.length})
        </h2>
        {questions.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune sollicitation pour le moment.</p>
        )}
        {groupes.map((g) => {
          const nom = dossierNomById.get(g.aoId) ?? "Dossier inconnu";
          return (
            <section key={g.aoId} className="space-y-3">
              <h3 className="flex items-baseline gap-2 border-b border-input pb-1">
                <span className="text-sm font-semibold text-foreground">{nom}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {g.items.length} sollicitation{g.items.length > 1 ? "s" : ""}
                </span>
              </h3>
              {g.items.map((q) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  onValider={() => valider(q)}
                  dossierNom={nom}
                />
              ))}
            </section>
          );
        })}
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
