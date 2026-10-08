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
import { RefreshCw, Inbox, PenLine, Send, MailCheck, Hourglass, FolderOpen, LockKeyhole, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { QuestionCard } from "@/components/question-card";
import { type QuestionInterne, type Dossier, learnReponsesRecues } from "@/lib/sollicitations";
import { Indicateur } from "@/components/visuel/carte";
import { Compteur } from "@/components/visuel/compteur";
import { Jauge } from "@/components/visuel/jauge";
import { EtatVide } from "@/components/visuel/etat-vide";

export default function InboxPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionInterne[]>([]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Filtre par dossier. "" = tous. Alimenté par ?ao=<id> pour arriver directement sur les
  // échanges d'un appel d'offres depuis son onglet « Sollicitations ».
  const [filtreAo, setFiltreAo] = useState<string>("");

  useEffect(() => {
    const ao = new URLSearchParams(window.location.search).get("ao");
    if (ao) setFiltreAo(ao);
  }, []);

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

  // ── Apprentissage RAG (option B) : à l'affichage, on demande au backend d'affiner + indexer les
  //    réponses reçues dans rag_chunk. Idempotent (le backend ignore ce qui est déjà indexé), donc
  //    sûr à appeler à chaque chargement. Une fois par dossier ayant au moins une réponse.
  useEffect(() => { learnReponsesRecues(questions, apiFetch); }, [questions]);

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

  const groupesAffiches = useMemo(
    () => (filtreAo ? groupes.filter((g) => g.aoId === filtreAo) : groupes),
    [groupes, filtreAo],
  );
  const nbAffichees = useMemo(
    () => groupesAffiches.reduce((n, g) => n + g.items.length, 0),
    [groupesAffiches],
  );

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

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (!ready) return <Shell><p className="text-sm text-muted-foreground">Chargement…</p></Shell>;

  if (!userEmail) {
    return (
      <Shell>
        <Card className="animate-monter">
          <CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole aria-hidden="true" className="h-[18px] w-[18px] text-primary" />Connexion requise</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Connectez-vous pour accéder à votre boîte de réception.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Infos utiles (purement informatives) : calculées sur la liste déjà chargée, aucune requête.
  // « En attente » : même règle que la liste des dossiers (envoyée, sans réponse reçue).
  const nbReponsesRecues = questions.filter((q) => q.statut === "reponse_recue" || q.statut === "validee").length;
  const nbEnAttente = questions.filter(
    (q) => q.reponse_recue_at == null && (q.statut === "envoyee" || q.statut === "reponse_en_attente"),
  ).length;

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-o1">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="min-w-0 truncate">Connecté : <span className="font-medium text-foreground">{userEmail}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={loadQuestions}><RefreshCw /> Rafraîchir</Button>
          <Link href="/sollicitations/nouveau">
            <Button size="sm"><PenLine /> Rédiger une sollicitation</Button>
          </Link>
        </div>
      </div>

      {/* Indicateurs (infos utiles calculées sur les sollicitations déjà chargées) */}
      <div className="apparait mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3.5">
        <Indicateur className={indicateurClass} icone={Send} libelle="Sollicitations" valeur={<Compteur valeur={questions.length} />} />
        <Indicateur className={indicateurClass} icone={MailCheck} libelle="Réponses reçues" valeur={<Compteur valeur={nbReponsesRecues} />} />
        <Indicateur className={indicateurClass} icone={Hourglass} libelle="En attente" valeur={<Compteur valeur={nbEnAttente} />} alerte={nbEnAttente > 0} />
      </div>

      {/* Filtre par dossier : consulter les échanges d'un seul appel d'offres sans perdre
          la vue globale. Alimenté par ?ao= depuis l'onglet « Sollicitations » d'un dossier. */}
      {groupes.length > 0 && (
        <div className="mb-5 flex animate-monter flex-wrap items-center gap-2.5 rounded-xl border border-border bg-[#FAFBFC] px-4 py-3">
          <label htmlFor="filtre-dossier" className="text-[13px] font-semibold text-muted-foreground">
            Filtrer par dossier
          </label>
          <select
            id="filtre-dossier"
            className="h-10 min-w-[12rem] flex-1 rounded-[9px] border border-input bg-card px-3 text-sm shadow-o1 transition-[border-color,box-shadow] hover:border-[#B9C5D4]"
            value={filtreAo}
            onChange={(e) => setFiltreAo(e.target.value)}
          >
            <option value="">Tous les dossiers ({questions.length})</option>
            {groupes.map((g) => (
              <option key={g.aoId} value={g.aoId}>
                {dossierNomById.get(g.aoId) ?? "Dossier inconnu"} ({g.items.length})
              </option>
            ))}
          </select>
          {filtreAo && (
            <Button variant="ghost" size="sm" onClick={() => setFiltreAo("")}>
              Voir tous les dossiers
            </Button>
          )}
        </div>
      )}

      {err && (
        <div className="mb-3 animate-monter rounded-xl border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">{err}</div>
      )}

      <div className="space-y-6">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <Inbox className="size-[18px] text-primary" />
          {filtreAo
            ? `${dossierNomById.get(filtreAo) ?? "Dossier"} — ${nbAffichees} sollicitation${nbAffichees > 1 ? "s" : ""}`
            : `Toutes mes sollicitations (${questions.length})`}
        </h2>
        {questions.length === 0 && (
          <EtatVide icone={Inbox} pointilles>
            <p className="text-[15px] font-semibold text-foreground">Aucune sollicitation pour le moment.</p>
          </EtatVide>
        )}
        {questions.length > 0 && groupesAffiches.length === 0 && (
          <EtatVide icone={FolderOpen} pointilles>
            <p className="text-[15px] font-semibold text-foreground">
              Aucune sollicitation pour ce dossier.{" "}
              <button type="button" className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover" onClick={() => setFiltreAo("")}>
                Voir tous les dossiers
              </button>
            </p>
          </EtatVide>
        )}
        {groupesAffiches.map((g) => {
          const nom = dossierNomById.get(g.aoId) ?? "Dossier inconnu";
          return (
            <section key={g.aoId} className="animate-monter space-y-3">
              <h3 className="flex items-start gap-2.5 border-b border-border pb-2.5">
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <FolderOpen className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-1">
                <span className="min-w-0 text-[15px] font-semibold leading-snug text-foreground">{nom}</span>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {g.items.length} sollicitation{g.items.length > 1 ? "s" : ""}
                </span>
                <span aria-hidden="true" className="ml-auto flex items-center gap-2 font-mono text-[11.5px] font-medium text-subtle-foreground">
                  <Jauge
                    valeur={(g.items.filter((q) => q.statut === "reponse_recue" || q.statut === "validee").length / g.items.length) * 100}
                    ton="succes"
                    epaisseur={5}
                    className="w-16"
                  />
                  {g.items.filter((q) => q.statut === "reponse_recue" || q.statut === "validee").length}/{g.items.length} réponse{g.items.length > 1 ? "s" : ""}
                </span>
                </span>
              </h3>
              {g.items.map((q) => (
                <QuestionCard
                  key={q.id}
                  q={q}
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

const indicateurClass = "max-sm:py-3";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[960px] px-4 pb-10 pt-6 md:px-9 md:pt-[30px]">
      <h1 className="mb-1 flex animate-monter items-center gap-3 font-display text-[26px] font-bold leading-[1.1] text-foreground md:text-[28px]">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-o1">
          <Inbox className="size-5" />
        </span>
        Boîte de réception
      </h1>
      <p className="mb-6 animate-monter text-sm text-muted-foreground md:pl-[52px]">
        Toutes vos sollicitations internes, tous dossiers confondus, avec leur statut et la réponse reçue.
      </p>
      {children}
    </div>
  );
}
