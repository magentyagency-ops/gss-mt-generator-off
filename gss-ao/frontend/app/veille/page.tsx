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

const DEMO_EMAILS = [
  {
    id: "demo-1",
    sujet: "[Nukema] Alerte opportunité - Mairie de Port-Jérôme-sur-Seine",
    expediteur: "Alerte Nukema <alerte@nukema.com>",
    date: "Aujourd'hui, 14:15",
    dpt: "76",
    importance: "Haute",
    contenu: `Bonjour Clarence,

Une nouvelle opportunité a été détectée sur votre zone géographique (76) :

Acheteur : Mairie de Port-Jérôme-sur-Seine (76330)
Objet : Prestations de surveillance physique des bâtiments communaux, du cinéma, de la salle de spectacles et sécurité événementielle.
Date limite de réponse : 25 Juillet 2026 à 12:00
Lots associés : Lot 1 (Gardiennage fixe), Lot 2 (Sécurité événementielle)

Description sommaire :
La commune recherche un prestataire qualifié pour assurer la surveillance de ses locaux administratifs et culturels. Présence d'agents SSIAP requise lors des représentations. Visite sur site recommandée le 5 Juillet 2026.

Lien de l'appel d'offres : https://marches-publics.nukema.com/opportunities/d-982734`,
    parsed: {
      id: "demo-dossier-1",
      acheteur: "Mairie de Port-Jérôme-sur-Seine",
      objet: "Surveillance physique des bâtiments communaux et sécurité événementielle",
      dateLimite: "2026-07-25",
      departement: "76",
      emailSummary: "Prestations de gardiennage et surveillance humaine des locaux communaux, cinéma, et salles de spectacle de la ville de Port-Jérôme. Le prestataire devra également fournir des agents de sécurité évènementielle pour les festivités locales et des agents SSIAP qualifiés.",
      suggestionSections: [
        "Section I : Moyens humains affectés spécifiquement au marché",
        "Section II : Organisation des rondes de surveillance dans le cinéma",
        "Section III : Dispositif de sécurité événementielle et gestion des foules",
        "Section IV : Plan de continuité d'activité et palliatif des absences"
      ],
      lienUnique: "https://marches-publics.nukema.com/opportunities/d-982734",
      dceStatut: "extrait" as const
    }
  },
  {
    id: "demo-2",
    sujet: "[Nukema] Alerte opportunité - Métropole Rouen Normandie",
    expediteur: "Alerte Nukema <alerte@nukema.com>",
    date: "Hier, 09:30",
    dpt: "76",
    importance: "Moyenne",
    contenu: `Bonjour Clarence,

Une opportunité de marché public correspond à votre profil d'activité :

Acheteur : Métropole Rouen Normandie
Objet : Sécurité incendie et gardiennage des parkings relais et bâtiments techniques de la métropole.
Date limite de réponse : 18 Août 2026
Lots associés : Lot unique (Sécurité et Incendie)
Département : Seine-Maritime (76)

Description sommaire :
Surveillance préventive contre le vandalisme et les intrusions sur les parkings P+R. Rondes mobiles régulières avec véhicule sérigraphié requis. Gestion des alarmes techniques.

Lien : https://marches-publics.nukema.com/opportunities/d-1192304`,
    parsed: {
      id: "demo-dossier-2",
      acheteur: "Métropole Rouen Normandie",
      objet: "Sécurité incendie et gardiennage des parkings relais",
      dateLimite: "2026-08-18",
      departement: "76",
      emailSummary: "Prestations de surveillance, gardiennage et sécurité incendie sur les différents parkings relais (P+R) et sites techniques gérés par la métropole de Rouen. Exigence forte sur la mise en place de rondes véhiculées régulières et d'une réactivité sur alarme technique.",
      suggestionSections: [
        "Section I : Moyens opérationnels et véhicules sérigraphiés",
        "Section II : Protocoles de rondes et contrôle des parkings relais",
        "Section III : Télésurveillance et levée de doute sur alarme",
        "Section IV : Qualité des prestations et reporting métrique"
      ],
      lienUnique: "https://marches-publics.nukema.com/opportunities/d-1192304",
      dceStatut: "en_attente" as const
    }
  }
];

export default function VeillePage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string>("demo-1");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ParsedOpportunity | null>(null);
  const [simulatedDceStatus, setSimulatedDceStatus] = useState<"none" | "uploading" | "ready">("none");

  // Get active email object
  const activeEmail = DEMO_EMAILS.find(e => e.id === selectedEmailId) || DEMO_EMAILS[0];

  // Instantly load parsed preview of active email (or mock processing)
  useEffect(() => {
    setLoading(true);
    setPreview(null);
    setSimulatedDceStatus("none");

    const timer = setTimeout(() => {
      setPreview(activeEmail.parsed);
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [selectedEmailId]);

  const handleSimulateDceUpload = () => {
    setSimulatedDceStatus("uploading");
    setTimeout(() => {
      setSimulatedDceStatus("ready");
    }, 1800);
  };

  const handleConfirmDossier = (dossierId: string) => {
    const selectedDemo = DEMO_EMAILS.find(d => d.parsed.id === dossierId);
    if (selectedDemo) {
      // Identifiant réel (UUID) attendu par la table Supabase dossiers.
      const newId = crypto.randomUUID();
      // Save the dossier in real DB so it gets persisted on dashboard
      apiFetch("/api/dossiers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: newId,
          acheteur: selectedDemo.parsed.acheteur,
          objet: selectedDemo.parsed.objet,
          dateLimite: selectedDemo.parsed.dateLimite,
          departement: selectedDemo.parsed.departement,
          statut: "Brouillon",
          responsable: "Sacha",
          emailSummary: selectedDemo.parsed.emailSummary,
          suggestionSections: selectedDemo.parsed.suggestionSections,
          importedFromEmail: true,
          dce_files: simulatedDceStatus === "ready" ? [
            { nom: `CCTP_Gardiennage_${selectedDemo.parsed.acheteur.replace(/\s+/g, "_")}.pdf`, type: "pdf", taille: "3.8 Mo", statut: "ok" },
            { nom: `RC_${selectedDemo.parsed.acheteur.replace(/\s+/g, "_")}_2026.pdf`, type: "pdf", taille: "1.5 Mo", statut: "ok" }
          ] : []
        })
      }).then(() => {
        window.location.href = `/dossiers/${newId}`;
      }).catch(err => {
        console.error("Error creating demo dossier:", err);
        window.location.href = "/";
      });
    }
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
            <h1 className="text-xl font-semibold">Boîte de Réception Veille (Nukema)</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Alertes reçues automatiquement. Sélectionnez un e-mail pour extraire le DCE et initier le mémoire.
          </p>
        </div>
        <div>
          <Badge variant="outline" className="bg-white/10 text-white border-white/20 animate-pulse font-medium">
            🔴 Simulateur d'alertes actif
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
              Courriers entrants ({DEMO_EMAILS.length})
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {DEMO_EMAILS.map((email) => {
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
                      {(email as any).acheteur || "Nukema"}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {email.date.split(", ")[1] || email.date}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-foreground/90 truncate">
                    {email.sujet}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {email.contenu.replace(/Bonjour Clarence,/, "").trim()}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[9px] py-0.5 px-1 bg-background font-normal border-border/80">
                      Dpt {email.dpt}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] py-0.5 px-1 bg-primary/5 text-primary border-primary/20 font-normal">
                      Nukema Alert
                    </Badge>
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
                        <div>Date : <span className="font-medium text-foreground">{activeEmail.date}</span></div>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-background border-border text-muted-foreground shrink-0 font-normal">
                      Priorité {activeEmail.importance}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 pb-5">
                  <div className="whitespace-pre-line text-xs font-mono leading-relaxed text-foreground/90 bg-background/40 rounded-lg p-4 border border-border/30">
                    {activeEmail.contenu}
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
                            Extraire le DCE (CCTP, Règlement) directement depuis le lien Nukema contenu dans ce mail.
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
                        onClick={() => handleConfirmDossier(preview.id)}
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
