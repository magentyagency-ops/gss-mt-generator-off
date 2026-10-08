"use client";

import { useState, useEffect } from "react";
import { 
  Radar, 
  Mail, 
  Send, 
  ArrowRight, 
  Sparkles, 
  Calendar, 
  MapPin, 
  FileText, 
  CheckCircle2, 
  Loader2,
  Inbox,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Clock,
  Building2
} from "lucide-react";
import { 
  Button, 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle,
  Badge
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { Initiales } from "@/components/visuel/carte";
import { PointActif } from "@/components/visuel/pastille-statut";
import { Squelette } from "@/components/visuel/squelette";

interface ParsedOpportunity {
  id: string;
  acheteur: string;
  objet: string;
  dateLimite: string;
  departement: string;
  emailSummary: string;
  suggestionSections: string[];
  lienUnique?: string;
  dceStatut?: "en_attente" | "extrait" | "non_dispo";
}

/** Alerte telle que renvoyée par le backend (table veille_alerte). */
interface AlerteVeille {
  id: string;
  expediteur: string;
  expediteur_nom: string | null;
  sujet: string;
  corps: string;
  recu_at: string;
  statut: "recue" | "analysee" | "traitee" | "ignoree";
  parsed: ParsedOpportunity | null;
  dossier_id: string | null;
}

/** Horodatage court pour la liste : « 14:15 » aujourd'hui, « 22/09 » sinon. */
function heureCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const aujourdhui = new Date();
  const memeJour =
    d.getDate() === aujourdhui.getDate() &&
    d.getMonth() === aujourdhui.getMonth() &&
    d.getFullYear() === aujourdhui.getFullYear();
  return memeJour
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/**
 * Masquage temporaire de la liste des alertes Nukema — demande de Clarence, le temps de
 * vérifier la faisabilité de la veille.
 *
 * RIEN N'EST SUPPRIMÉ. La page, la table, l'Edge Function de réception et les endpoints
 * restent en place et continuent de fonctionner : les alertes reçues sont toujours
 * enregistrées en base, elles ne sont simplement plus affichées.
 *
 * POUR RÉTABLIR : passer cette constante à false. Rien d'autre à faire.
 */
const ALERTES_MASQUEES = true;

export default function VeillePage() {
  const [alertes, setAlertes] = useState<AlerteVeille[]>([]);
  const [chargementListe, setChargementListe] = useState(true);
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ParsedOpportunity | null>(null);
  const [simulatedDceStatus, setSimulatedDceStatus] = useState<"none" | "uploading" | "ready">("none");

  // Alertes réellement reçues (table veille_alerte), la plus récente en premier.
  useEffect(() => {
    // Masquage temporaire : on n'interroge même pas le serveur, la liste reste vide.
    if (ALERTES_MASQUEES) { setChargementListe(false); return; }
    let annule = false;
    (async () => {
      try {
        const res = await apiFetch("/api/veille/alertes");
        const data = await res.json();
        if (annule) return;
        const liste: AlerteVeille[] = Array.isArray(data) ? data : [];
        setAlertes(liste);
        if (liste.length > 0) setSelectedEmailId((id) => id || liste[0].id);
      } catch {
        if (!annule) setErreurListe("Impossible de charger les alertes de veille.");
      } finally {
        if (!annule) setChargementListe(false);
      }
    })();
    return () => { annule = true; };
  }, []);

  const activeEmail = alertes.find((e) => e.id === selectedEmailId) ?? null;

  // Analyse de l'alerte sélectionnée. Déclenchée à la demande et mise en cache côté base :
  // une alerte déjà analysée ne redéclenche aucun appel au modèle.
  useEffect(() => {
    if (!activeEmail) { setPreview(null); return; }
    let annule = false;
    setLoading(true);
    setPreview(null);
    setSimulatedDceStatus("none");

    (async () => {
      try {
        if (activeEmail.parsed) {
          if (!annule) setPreview(activeEmail.parsed);
          return;
        }
        const res = await apiFetch(`/api/veille/alertes/${activeEmail.id}/analyser`, { method: "POST" });
        const data = await res.json();
        if (annule) return;
        if (data?.parsed) {
          setPreview(data.parsed as ParsedOpportunity);
          // Mémorise le résultat dans la liste : re-sélectionner l'alerte ne relancera rien.
          setAlertes((prev) => prev.map((a) => (a.id === activeEmail.id ? { ...a, parsed: data.parsed } : a)));
        } else {
          setPreview(null);
        }
      } catch {
        if (!annule) setPreview(null);
      } finally {
        if (!annule) setLoading(false);
      }
    })();

    return () => { annule = true; };
  }, [selectedEmailId, activeEmail]);

  const handleSimulateDceUpload = () => {
    setSimulatedDceStatus("uploading");
    setTimeout(() => {
      setSimulatedDceStatus("ready");
    }, 1800);
  };

  const handleConfirmDossier = () => {
    if (!preview || !activeEmail) return;
    // Identifiant réel (UUID) attendu par la table Supabase dossiers.
    const newId = crypto.randomUUID();
    const alerteId = activeEmail.id;
    // Le chemin de création du dossier est INCHANGÉ : seules les données qui l'alimentent
    // viennent désormais d'une alerte réellement reçue, et non d'un exemple codé en dur.
    apiFetch("/api/dossiers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: newId,
        acheteur: preview.acheteur,
        objet: preview.objet,
        dateLimite: preview.dateLimite,
        departement: preview.departement,
        statut: "Brouillon",
        responsable: "Sacha",
        emailSummary: preview.emailSummary,
        suggestionSections: preview.suggestionSections,
        importedFromEmail: true,
        dce_files: simulatedDceStatus === "ready" ? [
          { nom: `CCTP_Gardiennage_${preview.acheteur.replace(/\s+/g, "_")}.pdf`, type: "pdf", taille: "3.8 Mo", statut: "ok" },
          { nom: `RC_${preview.acheteur.replace(/\s+/g, "_")}_2026.pdf`, type: "pdf", taille: "1.5 Mo", statut: "ok" }
        ] : []
      })
    }).then(async () => {
      // Trace le dossier issu de cette alerte : un collègue verra qu'elle est déjà traitée.
      try {
        await apiFetch(`/api/veille/alertes/${alerteId}/lier-dossier`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier_id: newId }),
        });
      } catch {
        /* Le dossier est créé, c'est l'essentiel : le rattachement est un confort. */
      }
      window.location.href = `/dossiers/${newId}`;
    }).catch(err => {
      console.error("Erreur lors de la création du dossier depuis une alerte :", err);
      window.location.href = "/";
    });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex animate-monter flex-wrap items-end justify-between gap-4 px-4 pb-5 pt-6 md:px-9 md:pt-[30px]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-o1">
              <Radar className="h-[18px] w-[18px] shrink-0" />
            </div>
            <h1 className="font-display text-[26px] font-bold leading-[1.1] md:text-[28px]">Boîte de Réception Veille</h1>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Alertes reçues automatiquement. Sélectionnez un e-mail pour extraire le DCE et initier le mémoire.
          </p>
        </div>
        <div>
          <Badge variant="outline" className="gap-2 rounded-full border-border bg-card px-3 py-1 text-[12.5px] font-semibold text-foreground shadow-o1">
            <Mail aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
            {alertes.length} alerte{alertes.length > 1 ? "s" : ""} reçue{alertes.length > 1 ? "s" : ""}
          </Badge>
        </div>
      </header>

      {/* Main Mailbox Layout */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6 md:flex-row md:overflow-hidden md:px-9 md:pb-8">
        
        {/* Left Column: Email List Inbox */}
        <div className="flex w-full shrink-0 animate-monter flex-col overflow-hidden rounded-xl border border-border bg-card shadow-o1 [animation-delay:60ms] md:w-80 md:overflow-y-auto">
          <div className="sticky top-0 z-[1] border-b border-border bg-[#FAFBFC] px-4 py-3">
            <div className="petites-capitales flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5 text-primary" />
              Courriers entrants ({alertes.length})
            </div>
          </div>
          <div className="divide-y divide-border">
            {chargementListe && (
              <div className="space-y-4 p-4">
                  <div aria-hidden="true" className="flex gap-3">
                    <Squelette className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
                    <div className="flex-1 space-y-2">
                      <Squelette className="h-3 w-3/5" />
                      <Squelette className="h-3 w-4/5" />
                    </div>
                  </div>
                  <div aria-hidden="true" className="flex gap-3">
                    <Squelette className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
                    <div className="flex-1 space-y-2">
                      <Squelette className="h-3 w-3/5" />
                      <Squelette className="h-3 w-4/5" />
                    </div>
                  </div>
                  <div aria-hidden="true" className="flex gap-3">
                    <Squelette className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
                    <div className="flex-1 space-y-2">
                      <Squelette className="h-3 w-3/5" />
                      <Squelette className="h-3 w-4/5" />
                    </div>
                  </div>
              <p className="text-xs text-muted-foreground">Chargement des alertes…</p>
              </div>
            )}
            {!chargementListe && erreurListe && (
              <p className="m-3 flex items-center gap-2 rounded-[9px] bg-destructive-soft p-3 text-xs text-destructive"><AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />{erreurListe}</p>
            )}
            {!chargementListe && !erreurListe && alertes.length === 0 && (
              <div className="flex animate-monter flex-col items-center gap-3 px-6 py-10 text-center [animation-delay:160ms]">
                <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-secondary text-primary ring-8 ring-secondary/50">
                  <Mail className="h-7 w-7 motion-safe:animate-flotte" strokeWidth={1.6} />
                </span>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Aucune alerte reçue pour le moment. Les alertes arrivent par e-mail et s'affichent ici automatiquement.
              </p>
              </div>
            )}
            {alertes.map((email) => {
              const active = selectedEmailId === email.id;
              return (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmailId(email.id)}
                  className={cn(
                    "presse animate-monter cursor-pointer border-l-[3px] flex flex-col gap-1.5 px-4 py-3.5 text-left",
                    active
                      ? "bg-secondary border-l-signal"
                      : "hover:bg-[#F8FAFD] border-l-transparent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full bg-signal", email.dossier_id && "bg-transparent")} aria-hidden="true" />
                    <span className="mr-auto font-semibold text-[13px] text-foreground truncate">
                      {email.parsed?.acheteur || email.expediteur_nom || email.expediteur}
                    </span>
                    <span className="font-mono text-[11px] text-subtle-foreground shrink-0 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {heureCourte(email.recu_at)}
                    </span>
                  </div>
                  <div className="text-[13px] font-medium text-foreground/90 truncate">
                    {email.sujet}
                  </div>
                  <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {email.corps.trim()}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {email.parsed?.departement && (
                      <Badge variant="outline" className="text-[10.5px] py-px px-1.5 font-mono font-medium">
                        Dpt {email.parsed.departement}
                      </Badge>
                    )}
                    {email.dossier_id && (
                      <Badge variant="success" className="text-[10.5px] py-px px-2">
                        Dossier créé
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right/Main Column: Email Reader & Actions */}
        <div className="flex min-h-[320px] flex-1 animate-monter flex-col overflow-y-auto rounded-xl border border-border bg-card/60 p-4 shadow-o1 [animation-delay:120ms] md:p-6">
          
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-secondary"><Loader2 className="h-7 w-7 text-primary animate-spin" /></span>
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><PointActif />Chargement de l'alerte email...</p>
            </div>
          ) : !activeEmail ? (
            <div className="flex-1 flex animate-monter flex-col items-center justify-center gap-3 px-4 py-10 text-center [animation-delay:220ms]">
              <span aria-hidden="true" className="mb-1 grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary ring-8 ring-secondary/50">
                <Inbox className="h-8 w-8" strokeWidth={1.6} />
              </span>
              <p className="max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
                Aucune alerte sélectionnée. Les alertes reçues par e-mail apparaissent dans la colonne de gauche.
              </p>
            </div>
          ) : (
            <div className="apparait space-y-5 max-w-4xl mx-auto w-full">
              
              {/* Email Reader View */}
              <Card>
                <CardHeader className="pb-4 border-b border-border">
                  <div className="flex items-start gap-3.5">
                    <Initiales texte={activeEmail.expediteur_nom || activeEmail.expediteur} />
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold text-foreground mb-1.5">
                        {activeEmail.sujet}
                      </CardTitle>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <div>De : <span className="font-medium text-foreground">{activeEmail.expediteur}</span></div>
                        <div>Date : <span className="font-medium text-foreground">{new Date(activeEmail.recu_at).toLocaleString("fr-FR")}</span></div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 pb-5">
                  <div className="whitespace-pre-line text-xs font-mono leading-relaxed text-foreground/90 bg-[#FAFBFC] rounded-[10px] p-4 border border-border">
                    {activeEmail.corps}
                  </div>
                </CardContent>
              </Card>

              {/* Extraction & Integration flow */}
              {preview && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  {/* Frise Étape 1 → Étape 2 (suit l'état d'extraction déjà affiché) */}
                  <div aria-hidden="true" className="flex items-center gap-3 px-1">
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold transition-colors duration-300", simulatedDceStatus === "ready" ? "bg-success-soft text-success" : "bg-primary text-primary-foreground")}>1</span>
                    <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-secondary">
                      <span className={cn("absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,hsl(var(--success)),hsl(var(--signal)))] transition-[width] duration-[400ms] ease-doux", simulatedDceStatus === "ready" ? "w-full" : simulatedDceStatus === "uploading" ? "w-1/2 reflet-actif" : "w-0")} />
                    </span>
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold transition-colors duration-300", simulatedDceStatus === "ready" ? "bg-signal text-primary" : "bg-secondary text-muted-foreground")}>2</span>
                  </div>
                  
                  {/* Step 1: DCE Extraction */}
                  <Card className="animate-monter">
                    <CardHeader className="pb-3 border-b border-border bg-[#FAFBFC] rounded-t-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-primary" />
                          <CardTitle className="petites-capitales">Étape 1 : Pièces jointes & Extraction DCE</CardTitle>
                        </div>
                        <Badge 
                          variant={simulatedDceStatus === "ready" ? "success" : simulatedDceStatus === "uploading" ? "warning" : "secondary"}
                          className="text-[11px]"
                        >
                          {simulatedDceStatus === "ready" ? "✓ Analyse Complétée" : simulatedDceStatus === "uploading" ? "Extraction en cours..." : "En attente"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {simulatedDceStatus === "none" && (
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#B9C5D4] rounded-xl bg-gradient-to-b from-card to-[#F8FAFC] transition-colors hover:border-primary/40">
                          <span aria-hidden="true" className="mb-2.5 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary"><Download className="h-6 w-6" /></span>
                          <p className="text-xs text-muted-foreground mb-3 text-center">
                            Extraire le DCE (CCTP, Règlement) directement depuis le lien contenu dans ce mail.
                          </p>
                          <Button size="sm" onClick={handleSimulateDceUpload} className="gap-1.5 text-xs font-medium">
                            <Sparkles className="h-3.5 w-3.5" />
                            Simuler l'extraction DCE
                          </Button>
                        </div>
                      )}

                      {simulatedDceStatus === "uploading" && (
                        <div className="flex flex-col items-center justify-center p-8 border border-border rounded-xl bg-[#FAFBFC]">
                          <Loader2 className="h-6 w-6 text-primary animate-spin mb-3" />
                          <p className="flex items-center gap-2 text-xs font-semibold text-foreground"><PointActif />Lecture intelligente du CCTP & Règlement...</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Extraction des exigences et critères</p>
                        </div>
                      )}

                      {simulatedDceStatus === "ready" && (
                        <div className="p-3.5 border border-success/25 bg-gradient-to-r from-success-soft to-card rounded-xl space-y-2.5 animate-in zoom-in-95">
                          <div className="text-xs font-semibold text-success flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Fichiers DCE extraits et indexés avec succès !
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2 p-2.5 bg-card rounded-[9px] border border-border shadow-o1">
                              <span>📄 CCTP_{preview.acheteur.replace(/\s+/g, "_")}.pdf</span>
                              <Badge variant="outline" className="text-[9px] ml-auto">Indexé</Badge>
                            </div>
                            <div className="flex items-center gap-2 p-2.5 bg-card rounded-[9px] border border-border shadow-o1">
                              <span>📄 RC_{preview.acheteur.replace(/\s+/g, "_")}.pdf</span>
                              <Badge variant="outline" className="text-[9px] ml-auto">Indexé</Badge>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Step 2: Synthesis & Launch MT */}
                  <Card className={cn(
                    "animate-monter transition-[opacity,box-shadow,border-color] duration-300 [animation-delay:80ms]",
                    simulatedDceStatus === "ready" ? "border-primary/30 shadow-o2 bg-gradient-to-br from-card to-[#F1F5FB]" : "opacity-80"
                  )}>
                    <CardHeader className="pb-3 border-b border-border bg-[#FAFBFC] rounded-t-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <CardTitle className="petites-capitales">Étape 2 : Synthèse d'appel d'offres</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      {/* Grid attributes */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="bg-card p-3 rounded-[10px] border border-border">
                          <div className="petites-capitales flex items-center gap-1.5 text-[10.5px]"><Building2 aria-hidden="true" className="h-3.5 w-3.5 text-primary" />Acheteur</div>
                          <div className="text-xs font-semibold text-foreground truncate">{preview.acheteur}</div>
                        </div>
                        <div className="bg-card p-3 rounded-[10px] border border-border">
                          <div className="petites-capitales flex items-center gap-1.5 text-[10.5px]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 text-primary" />Département</div>
                          <div className="text-xs font-semibold text-foreground">Dpt {preview.departement}</div>
                        </div>
                        <div className="bg-card p-3 rounded-[10px] border border-border">
                          <div className="petites-capitales flex items-center gap-1.5 text-[10.5px]"><Calendar aria-hidden="true" className="h-3.5 w-3.5 text-primary" />Date de remise</div>
                          <div className="text-xs font-semibold text-foreground">
                            {preview.dateLimite ? new Date(preview.dateLimite).toLocaleDateString("fr-FR") : "Non définie"}
                          </div>
                        </div>
                      </div>

                      {/* Summary */}
                      <div>
                        <div className="petites-capitales mb-1.5">Résumé du marché</div>
                        <p className="text-[13px] leading-relaxed text-muted-foreground bg-card rounded-[10px] p-3.5 border border-border">
                          {preview.emailSummary}
                        </p>
                      </div>

                      {/* Sections list */}
                      {preview.suggestionSections && preview.suggestionSections.length > 0 && (
                        <div>
                          <div className="petites-capitales mb-2">Sections recommandées pour le mémoire</div>
                          <div className="apparait grid gap-2 sm:grid-cols-2">
                            {preview.suggestionSections.map((sec, idx) => (
                              <div key={idx} className="flex items-center gap-2.5 p-2.5 bg-card rounded-[9px] border border-border text-[13px] text-muted-foreground">
                                <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground font-mono text-[11px] flex items-center justify-center font-semibold shrink-0">{idx + 1}</span>
                                <span className="truncate">{sec.replace(/^Section\s[IVX]+\s:\s/, "")}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="flex justify-end border-t border-border pt-4 bg-[#FAFBFC] rounded-b-xl">
                      <Button 
                        onClick={handleConfirmDossier}
                        size="lg"
                        className="w-full sm:w-auto"
                      >
                        {simulatedDceStatus === "ready" ? "Lancer la génération du mémoire technique" : "Créer le brouillon de dossier"}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>

                </div>
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
