"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  MapPin,
  Building2,
  FileText,
  Mail,
  Star,
  UserPlus,
  AlertTriangle,
  ArrowRight,
  Scale,
  ShieldAlert,
  Clock,
  Banknote,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { DossierNav } from "@/components/dossier-nav";
import {
  formatDate,
  formatDateHeure,
  joursRestants,
} from "@/lib/gss-config";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { QuestionCard } from "@/components/question-card";
import { type QuestionInterne } from "@/lib/sollicitations";
import { useDossier } from "./dossier-context";

function StatPill({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/20 bg-white/5 px-4 py-3">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md",
          accent ? "bg-destructive/20 text-destructive-foreground" : "bg-white/10 text-white",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wide text-white/70">{label}</div>
        <div className="text-sm font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}

export default function SynthesePage({ params }: { params: { id: string } }) {
  const id = params.id;
  const { dossier: dossierInfo, refresh: refreshDossier } = useDossier();

  const [isEditingObjet, setIsEditingObjet] = useState(false);
  const [objetValue, setObjetValue] = useState("");

  useEffect(() => {
    if (dossierInfo?.objet) {
      setObjetValue(dossierInfo.objet);
    }
  }, [dossierInfo?.objet]);

  // ── Infos manquantes détectées APRÈS l'analyse du DCE (indépendant de la génération) ─────────
  // Si déjà persistées → on les affiche. Sinon, dès qu'un DCE est présent, on lance la détection
  // automatiquement (une seule fois, garde par ref pour ne pas relancer à chaque re-render).
  const [missingFields, setMissingFields] = useState<Array<{ id: string; label: string; context: string; criticite?: "bloquant" | "facultatif" | "normal"; demande?: "web" | "equipe" }> | null>(null);
  const [completude, setCompletude] = useState<number | null>(null);
  const [contradictions, setContradictions] = useState<Array<{ sujet: string; detail: string }>>([]);
  const [detectingMissing, setDetectingMissing] = useState(false);
  const detectStartedRef = useRef(false);

  useEffect(() => {
    if (!dossierInfo) return;
    // La détection se fait APRÈS l'upload pour LES DEUX cas (cadre imposé = basé sur le template ;
    // sans cadre = basé sur les exigences). Le backend choisit la bonne stratégie.
    const st = dossierInfo?.memoire_cadre_state;
    const existing = st?.missingFields;
    if (Array.isArray(existing)) {
      setMissingFields(existing);
      setCompletude(typeof st?.completude === "number" ? st.completude : null);
      setContradictions(Array.isArray(st?.contradictions) ? st.contradictions : []);
      return;
    }
    if (detectStartedRef.current) return;
    const hasDce = Array.isArray(dossierInfo?.dce_files) && dossierInfo.dce_files.length > 0;
    if (!hasDce) return;
    detectStartedRef.current = true;
    setDetectingMissing(true);
    apiFetch(`/api/dossiers/${id}/detect-missing`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.missingFields)) setMissingFields(data.missingFields);
        if (typeof data.completude === "number") setCompletude(data.completude);
        if (Array.isArray(data.contradictions)) setContradictions(data.contradictions);
        refreshDossier();
      })
      .catch(() => {})
      .finally(() => setDetectingMissing(false));
  }, [dossierInfo, id, refreshDossier]);

  const handleRelaunchDetection = async () => {
    if (detectingMissing) return;
    setDetectingMissing(true);
    try {
      const res = await apiFetch(`/api/dossiers/${id}/detect-missing?force=true`, { method: "POST" });
      const data = await res.json();
      if (Array.isArray(data.missingFields)) setMissingFields(data.missingFields);
      if (typeof data.completude === "number") setCompletude(data.completude);
      if (Array.isArray(data.contradictions)) setContradictions(data.contradictions);
      refreshDossier();
    } catch (e) {
      console.error(e);
    } finally {
      setDetectingMissing(false);
    }
  };

  // ── Sollicitations du dossier (requête Supabase front SÉPARÉE, indépendante de l'apiFetch) ─
  // Filtrée sur ao_id = id du dossier courant ; la RLS scope déjà à l'utilisateur (pas de user_id).
  // Même client Supabase que /inbox. Ordre chronologique croissant → fil question → réponse.
  // Robustesse : en cas d'échec, sollicitationsError = true → la section n'est pas rendue et la
  // fiche s'affiche normalement (jamais de page blanche). Flag `annule` contre le setState post-démontage.
  const supabase = useMemo(() => createClient(), []);

  const [relancing, setRelancing] = useState(false);
  const [relanceMsg, setRelanceMsg] = useState<string | null>(null);
  const [sollicitations, setSollicitations] = useState<QuestionInterne[]>([]);
  const [sollicitationsLoaded, setSollicitationsLoaded] = useState(false);
  const [sollicitationsError, setSollicitationsError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("question_interne")
          .select("*")
          .eq("ao_id", id)
          .order("created_at", { ascending: true });
        if (annule) return;
        if (error || !Array.isArray(data)) { setSollicitationsError(true); return; }
        setSollicitationsError(false);
        setSollicitations(data as QuestionInterne[]);
        setSollicitationsLoaded(true);
      } catch {
        if (!annule) setSollicitationsError(true);
      }
    })();
    return () => { annule = true; };
  }, [supabase, id, reloadTick]);

  // Realtime : recharge les sollicitations de CE dossier au moindre changement (même pattern que /inbox).
  useEffect(() => {
    const channel = supabase
      .channel(`qi-dossier-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_interne", filter: `ao_id=eq.${id}` },
        () => setReloadTick((t) => t + 1),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, id]);

  // Nombre « en attente de réponse » (règle identique au badge de la liste des dossiers).
  const enAttente = useMemo(
    () =>
      sollicitations.filter(
        (q) => q.reponse_recue_at == null && (q.statut === "envoyee" || q.statut === "reponse_en_attente"),
      ).length,
    [sollicitations],
  );

  // Valider une sollicitation (RLS : réservé au propriétaire de l'AO / admin), puis recharge.
  async function validerSollicitation(q: QuestionInterne) {
    const { error } = await supabase
      .from("question_interne")
      .update({ statut: "validee" })
      .eq("id", q.id);
    if (!error) setReloadTick((t) => t + 1);
  }

  if (!dossierInfo) {
    return <div className="p-8 text-center">Chargement du dossier...</div>;
  }

  const jours = joursRestants(dossierInfo.dateLimite);

  return (
    <div className="flex h-full flex-col">
      {/* En-tête identité */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="default">{dossierInfo.statut}</Badge>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {dossierInfo.reference} · CCAG {dossierInfo.ccag} · CPV {dossierInfo.cpv}
              </span>
            </div>
            {isEditingObjet ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="text"
                  className="text-xl font-semibold bg-background border border-input rounded px-2 py-1 flex-1 min-w-[300px] text-foreground"
                  value={objetValue}
                  onChange={(e) => setObjetValue(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      setIsEditingObjet(false);
                      await apiFetch(`/api/dossiers`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id, objet: objetValue })
                      });
                      refreshDossier();
                    } else if (e.key === "Escape") {
                      setIsEditingObjet(false);
                      setObjetValue(dossierInfo.objet);
                    }
                  }}
                  autoFocus
                  onBlur={() => {
                    setIsEditingObjet(false);
                    setObjetValue(dossierInfo.objet);
                  }}
                />
              </div>
            ) : (
              <h1 
                className="text-xl font-semibold cursor-pointer hover:bg-white/10 rounded px-1 -ml-1 transition-colors group flex items-center gap-2"
                onClick={() => { setIsEditingObjet(true); setObjetValue(dossierInfo.objet); }}
                title="Cliquez pour renommer le dossier"
              >
                {dossierInfo.objet}
                <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </h1>
            )}
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" /> {dossierInfo.acheteur}
            </p>
          </div>
          <Link href={`/dossiers/${id}/conformite`}>
            <Button>
              Étape suivante <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 w-64 ml-auto">
          <StatPill icon={FileText} label="Procédure" value={dossierInfo.procedure} />
        </div>
      </header>

      <DossierNav id={id} />

      {/* Corps */}
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* Résumé Exécutif IA */}
          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-primary">
                <Sparkles className="h-5 w-5" /> 
                Synthèse du projet (Générée par l'IA)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm leading-relaxed text-foreground/90 space-y-4">
                {dossierInfo.synthese_projet && dossierInfo.synthese_projet.length > 0 ? (
                  dossierInfo.synthese_projet.map((item, i) => (
                    <div key={i}>
                      <strong className="text-primary">{i + 1}. {item.titre}</strong>
                      <p className="mt-1">{item.description}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground italic">En attente de l'analyse du CCTP par l'IA...</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Analyse des risques IA */}
          <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-5 w-5" /> 
                Analyse des risques & Points d'attention
              </CardTitle>
              <Badge variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">
                Aide au Go / No-Go
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {dossierInfo.analyse_risques && dossierInfo.analyse_risques.length > 0 ? (
                  dossierInfo.analyse_risques.map((risque, i) => {
                    const type = risque.type || "warning";
                    const isDestructive = type === "destructive";
                    const isPrimary = type === "primary";
                    return (
                      <div key={i} className={cn("rounded-lg border bg-background/50 px-4 py-3", 
                        isDestructive ? "border-destructive/20" : isPrimary ? "border-border" : "border-warning/30")}>
                        <div className={cn("mb-1 flex items-center gap-2 font-semibold", 
                          isDestructive ? "text-destructive" : isPrimary ? "text-primary" : "text-warning")}>
                          {isDestructive ? <Scale className="h-4 w-4" /> : isPrimary ? <Banknote className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                          {risque.titre}
                        </div>
                        <p className="text-sm text-muted-foreground">{risque.detail}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-1 sm:col-span-2">
                    <p className="text-muted-foreground italic text-sm">En attente de l'analyse du RC par l'IA...</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contradictions / ambiguïtés relevées dans le DCE */}
          {contradictions.length > 0 && (
            <Card className="shadow-sm border-destructive/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <AlertTriangle className="h-5 w-5" /> Contradictions / ambiguïtés du DCE
                  <span className="text-sm font-normal text-muted-foreground">({contradictions.length})</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">Incohérences relevées dans le dossier — à lever avant de répondre.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <ul className="space-y-1.5">
                  {contradictions.map((c, i) => (
                    <li key={i} className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm">
                      <div className="font-medium">{c.sujet}</div>
                      {c.detail && <div className="mt-0.5 text-xs text-muted-foreground">{c.detail}</div>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Infos manquantes détectées après l'analyse du DCE (avant génération), pour les deux cas. */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5" /> Informations manquantes
                {missingFields && (
                  <span className="text-sm font-normal text-muted-foreground">({missingFields.length})</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {typeof completude === "number" && (
                    <Badge variant={completude >= 80 ? "default" : completude >= 50 ? "secondary" : "outline"}>
                      Complétude {completude}%
                    </Badge>
                  )}
                </div>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Exigences du DCE non couvertes par la documentation GSS — à obtenir avant la génération.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {detectingMissing ? (
                <p className="text-sm text-muted-foreground">Analyse des exigences du DCE en cours…</p>
              ) : !missingFields ? (
                <p className="text-sm text-muted-foreground">En attente de l'analyse du DCE.</p>
              ) : missingFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune information manquante détectée.</p>
              ) : (
                <ul className="space-y-1.5">
                  {missingFields.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        "rounded-md border p-2 text-sm",
                        m.criticite === "bloquant" ? "border-destructive/40 bg-destructive/5" : "border-border",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{m.label}</div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {m.criticite === "bloquant" && <Badge variant="destructive">Bloquant</Badge>}
                          {m.criticite === "facultatif" && <Badge variant="outline">Facultatif</Badge>}
                          {m.demande === "web" ? (
                            <Badge variant="secondary" className="gap-1">
                              <Sparkles className="h-3 w-3" /> Recherche web
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Mail className="h-3 w-3" /> Demander à l'équipe
                            </Badge>
                          )}
                        </div>
                      </div>
                      {m.context && <div className="mt-0.5 text-xs text-muted-foreground">{m.context}</div>}
                    </li>
                  ))}
                </ul>
              )}

              {/* L'action « Demander à l'équipe » (routage IA) est sur la page Mémoire du dossier. */}
            </CardContent>
          </Card>

          {/* Sollicitations du dossier (mails internes en attente / répondus) */}
          {!sollicitationsError && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-5 w-5" /> Sollicitations
                  {sollicitationsLoaded && (
                    <span className="text-sm font-normal text-muted-foreground">
                      ({sollicitations.length} sollicitation{sollicitations.length > 1 ? "s" : ""})
                    </span>
                  )}
                  {sollicitationsLoaded && sollicitations.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      disabled={relancing}
                      onClick={async () => {
                        setRelancing(true);
                        setRelanceMsg(null);
                        try {
                          const r = await apiFetch(`/api/dossiers/${id}/relancer`, { method: "POST" });
                          const d = await r.json().catch(() => ({}));
                          setRelanceMsg(
                            d.relances > 0
                              ? `${d.relances} relance(s) envoyée(s).`
                              : d.message || "Aucune relance nécessaire.",
                          );
                          setReloadTick((t) => t + 1);
                        } catch {
                          setRelanceMsg("Échec de la relance.");
                        } finally {
                          setRelancing(false);
                        }
                      }}
                    >
                      {relancing ? "Relance…" : "Relancer les non répondues"}
                    </Button>
                  )}
                </CardTitle>
                {relanceMsg && <p className="text-xs text-muted-foreground">{relanceMsg}</p>}
                {sollicitationsLoaded && sollicitations.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {enAttente > 0
                      ? `${enAttente} en attente de réponse${enAttente > 1 ? "s" : ""}`
                      : "Aucune en attente de réponse"}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {!sollicitationsLoaded ? (
                  <p className="text-sm text-muted-foreground">Chargement des sollicitations…</p>
                ) : sollicitations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune sollicitation pour ce dossier.</p>
                ) : (
                  sollicitations.map((q) => (
                    <QuestionCard key={q.id} q={q} onValider={() => validerSollicitation(q)} />
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
