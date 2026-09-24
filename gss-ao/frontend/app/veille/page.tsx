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
  Clock
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
    <div className="flex h-full flex-col bg-background/30">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white">
              <Radar className="h-4 w-4 shrink-0" />
            </div>
            <h1 className="text-xl font-semibold">Boîte de Réception Veille</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Alertes reçues automatiquement. Sélectionnez un e-mail pour extraire le DCE et initier le mémoire.
          </p>
        </div>
        <div>
          <Badge variant="outline" className="bg-white/10 text-white border-white/20 font-medium">
            {alertes.length} alerte{alertes.length > 1 ? "s" : ""} reçue{alertes.length > 1 ? "s" : ""}
          </Badge>
        </div>
      </header>

      {/* Main Mailbox Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Email List Inbox */}
        <div className="w-80 border-r border-border bg-card/40 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-border/60 bg-muted/20">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" />
              Courriers entrants ({alertes.length})
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {chargementListe && (
              <p className="p-4 text-xs text-muted-foreground">Chargement des alertes…</p>
            )}
            {!chargementListe && erreurListe && (
              <p className="p-4 text-xs text-destructive">{erreurListe}</p>
            )}
            {!chargementListe && !erreurListe && alertes.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground">
                Aucune alerte reçue pour le moment. Les alertes arrivent par e-mail et s'affichent ici automatiquement.
              </p>
            )}
            {alertes.map((email) => {
              const active = selectedEmailId === email.id;
              return (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmailId(email.id)}
                  className={cn(
                    "p-4 cursor-pointer transition-all border-l-2 flex flex-col gap-1.5 text-left",
                    active
                      ? "bg-accent/60 border-l-primary"
                      : "hover:bg-accent/30 border-l-transparent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-foreground truncate">
                      {email.parsed?.acheteur || email.expediteur_nom || email.expediteur}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {heureCourte(email.recu_at)}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-foreground/90 truncate">
                    {email.sujet}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {email.corps.trim()}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {email.parsed?.departement && (
                      <Badge variant="outline" className="text-[9px] py-0.5 px-1 bg-background font-normal border-border/80">
                        Dpt {email.parsed.departement}
                      </Badge>
                    )}
                    {email.dossier_id && (
                      <Badge variant="outline" className="text-[9px] py-0.5 px-1 bg-success/10 text-success border-success/20 font-normal">
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
        <div className="flex-1 flex flex-col overflow-y-auto bg-background/20 p-6">
          
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Chargement de l'alerte email...</p>
            </div>
          ) : !activeEmail ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Inbox className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune alerte sélectionnée. Les alertes reçues par e-mail apparaissent dans la colonne de gauche.
              </p>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl mx-auto w-full">
              
              {/* Email Reader View */}
              <Card className="border-border/60 shadow-sm bg-card/80 backdrop-blur-md">
                <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base font-bold text-foreground mb-1.5">
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
                  <div className="whitespace-pre-line text-xs font-mono leading-relaxed text-foreground/90 bg-background/40 rounded-lg p-4 border border-border/30">
                    {activeEmail.corps}
                  </div>
                </CardContent>
              </Card>

              {/* Extraction & Integration flow */}
              {preview && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  
                  {/* Step 1: DCE Extraction */}
                  <Card className="border-border/60 shadow-sm bg-card/60">
                    <CardHeader className="pb-3 border-b border-border/35 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-primary" />
                          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Étape 1 : Pièces jointes & Extraction DCE</CardTitle>
                        </div>
                        <Badge 
                          variant={simulatedDceStatus === "ready" ? "success" : simulatedDceStatus === "uploading" ? "warning" : "secondary"}
                          className="font-normal text-[10px]"
                        >
                          {simulatedDceStatus === "ready" ? "✓ Analyse Complétée" : simulatedDceStatus === "uploading" ? "Extraction en cours..." : "En attente"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {simulatedDceStatus === "none" && (
                        <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-lg bg-background/25 hover:bg-background/40 transition-colors">
                          <Download className="h-7 w-7 text-muted-foreground/60 mb-2" />
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
                        <div className="flex flex-col items-center justify-center p-8 border border-border/40 rounded-lg bg-background/20">
                          <Loader2 className="h-6 w-6 text-primary animate-spin mb-3" />
                          <p className="text-xs font-semibold text-foreground">Lecture intelligente du CCTP & Règlement...</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Extraction des exigences et critères</p>
                        </div>
                      )}

                      {simulatedDceStatus === "ready" && (
                        <div className="p-3.5 border border-success/30 bg-success/5 rounded-lg space-y-2 animate-in zoom-in-95">
                          <div className="text-xs font-semibold text-success flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Fichiers DCE extraits et indexés avec succès !
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2 p-2 bg-background/60 rounded border border-border/40">
                              <span>📄 CCTP_{preview.acheteur.replace(/\s+/g, "_")}.pdf</span>
                              <Badge variant="outline" className="text-[9px] ml-auto">Indexé</Badge>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-background/60 rounded border border-border/40">
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
                    "border-border/60 shadow-lg transition-all",
                    simulatedDceStatus === "ready" ? "border-primary/40 shadow-primary/5 bg-gradient-to-br from-card to-primary/5" : "opacity-80"
                  )}>
                    <CardHeader className="pb-3 border-b border-border/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Étape 2 : Synthèse d'appel d'offres</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      {/* Grid attributes */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="bg-background/40 p-2.5 rounded-lg border border-border/40">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Acheteur</div>
                          <div className="text-xs font-semibold text-foreground truncate">{preview.acheteur}</div>
                        </div>
                        <div className="bg-background/40 p-2.5 rounded-lg border border-border/40">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Département</div>
                          <div className="text-xs font-semibold text-foreground">Dpt {preview.departement}</div>
                        </div>
                        <div className="bg-background/40 p-2.5 rounded-lg border border-border/40">
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Date de remise</div>
                          <div className="text-xs font-semibold text-foreground">
                            {preview.dateLimite ? new Date(preview.dateLimite).toLocaleDateString("fr-FR") : "Non définie"}
                          </div>
                        </div>
                      </div>

                      {/* Summary */}
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Résumé du marché</div>
                        <p className="text-xs leading-relaxed text-muted-foreground bg-background/30 rounded-lg p-3 border border-border/40">
                          {preview.emailSummary}
                        </p>
                      </div>

                      {/* Sections list */}
                      {preview.suggestionSections && preview.suggestionSections.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sections recommandées pour le mémoire</div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {preview.suggestionSections.map((sec, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-2 bg-background/35 rounded border border-border/30 text-xs text-muted-foreground">
                                <span className="h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold shrink-0">{idx + 1}</span>
                                <span className="truncate">{sec.replace(/^Section\s[IVX]+\s:\s/, "")}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="flex justify-end border-t border-border/40 pt-4 bg-muted/10">
                      <Button 
                        onClick={handleConfirmDossier}
                        className="gap-2 w-full sm:w-auto bg-primary hover:bg-primary/95 text-primary-foreground font-medium shadow"
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
