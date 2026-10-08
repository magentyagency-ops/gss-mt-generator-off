"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Trash2,
  Sparkles,
  Circle,
  Shield,
  Building2,
  Table,
  Layers,
  X,
  ChevronRight,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { type DceFile, type DossierRow } from "@/lib/gss-config";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { classifyDceFile, TYPE_LABELS } from "@/lib/dce-detect";
import { Anneau } from "@/components/visuel/anneau";
import { PointActif } from "@/components/visuel/pastille-statut";

// Ordre de la liste déroulante « type détecté » (l'utilisateur peut toujours corriger).
const TYPES = ["RC", "CCAP", "CCTP", "BPU / DPGF", "Mémoire (cadre)", "Acte d'Engagement", "Compte Rendu", "Annexe", "Inconnu"];

/** Archives ouvertes au dépôt (point 1 des retours GSS). */
const ZIP_EXT = /\.zip$/i;

/**
 * Ouvre les .zip déposés et renvoie leur contenu comme des pièces ordinaires ; tout le reste
 * passe inchangé. Le chemin interne est conservé sous la forme « archive/sous-dossier/piece.pdf »
 * via `customPath`, exactement comme pour un dossier déposé : classifyDceFile et le backend
 * continuent donc de fonctionner sans modification.
 */
async function expandZips(entries: File[]): Promise<File[]> {
  if (!entries.some((f) => ZIP_EXT.test(f.name))) return entries;

  const mod: any = await import("jszip");
  const JSZip = mod.default ?? mod;
  const out: File[] = [];

  for (const entry of entries) {
    if (!ZIP_EXT.test(entry.name)) {
      out.push(entry);
      continue;
    }
    try {
      const zip = await JSZip.loadAsync(entry);
      const base = entry.name.replace(ZIP_EXT, "");
      for (const item of Object.values<any>(zip.files)) {
        if (item.dir) continue;
        // Résidus d'archives créées sous macOS : jamais des pièces du DCE.
        if (item.name.startsWith("__MACOSX/") || item.name.endsWith(".DS_Store")) continue;
        const blob: Blob = await item.async("blob");
        const extracted = new File([blob], item.name.split("/").pop() || item.name, { type: blob.type });
        (extracted as any).customPath = `${base}/${item.name}`;
        out.push(extracted);
      }
    } catch {
      // Archive illisible ou protégée : on la garde telle quelle plutôt que de perdre la pièce.
      out.push(entry);
    }
  }
  return out;
}

/** Fichier en cours de dépôt : DceFile + le File brut + le score de confiance du classement. */
type StagedFile = DceFile & { file?: File; score?: number };

export default function NouveauDossierPage() {
  const router = useRouter();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const isAppendingRef = useRef(false);
  // Identifiant du dossier en cours de création, créé UNE SEULE FOIS et réutilisé par
  // l'enregistrement automatique en brouillon puis par le lancement (le backend fait un upsert).
  // Sans cela, chaque sauvegarde créerait un dossier supplémentaire.
  const dossierIdRef = useRef<string | null>(null);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    // Clean up local storage flag when arriving to guarantee a fresh session
    localStorage.removeItem("gss_cr_fourni");
  }, []);

  // Simulate automatic parsing completion after 1.5 seconds
  useEffect(() => {
    const hasParsing = files.some((f) => f.statut === "parsing");
    if (hasParsing) {
      const timer = setTimeout(() => {
        setFiles((prev) => prev.map((f) => (f.statut === "parsing" ? { ...f, statut: "ok" } : f)));
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [files]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    // L'élément est capturé AVANT l'await : ensuite, on en a encore besoin pour le réinitialiser.
    const input = e.target;
    if (input.files) {
      const incoming = await expandZips(Array.from(input.files));
      let isDceFolder = false;
      const newFiles = incoming.map(file => {
        // file.webkitRelativePath might look like "DCE/mon_fichier.pdf"
        const relativePath = (file as any).customPath || file.webkitRelativePath || file.name;
        if (relativePath.includes("/")) {
          isDceFolder = true;
        }
        // Classement par le classifieur partagé (lib/dce-detect.ts, jumeau du backend) : on lui
        // passe le CHEMIN complet pour qu'un DCE rangé par sous-dossiers (« DCE/CCTP/final.pdf »)
        // soit reconnu même quand le nom du fichier seul ne dit rien.
        const detected = classifyDceFile(relativePath);
        return {
          nom: relativePath,
          type: TYPE_LABELS[detected.type],
          score: detected.score,
          taille: (file.size / 1024).toFixed(0) + " Ko",
          statut: "parsing" as const,
          file: file
        };
      });

      if (isDceFolder) {
        localStorage.setItem("gss_cr_fourni", "true");
      }

      if (isAppendingRef.current) {
        setFiles(prev => [...prev, ...newFiles]);
      } else {
        setFiles(newFiles);
      }
      isAppendingRef.current = false; // Reset after use

      // Un <input type="file"> ne déclenche onChange que si sa VALEUR change. Sans cette remise
      // à zéro, re-sélectionner le MÊME dossier ou le même fichier ne produit aucun effet :
      // l'utilisateur clique, choisit, et rien ne s'affiche. On la fait ici, après avoir lu les
      // fichiers. Le glisser-déposer passe un objet simulé sans `value` : le test l'exclut.
      if (typeof input.value === "string") input.value = "";
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);

    if (!e.dataTransfer.items) {
      // Fallback for old browsers
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        isAppendingRef.current = false;
        handleFileChange({ target: { files: e.dataTransfer.files } } as any);
      }
      return;
    }

    const filesToProcess: File[] = [];

    const getFilesFromEntry = async (entry: any): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve) => entry.file(resolve));
        // Force the relative path so the rest of the code knows it's a folder structure
        try {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: entry.fullPath.substring(1), // remove leading '/'
            writable: false
          });
        } catch (e) {
          // Si le navigateur bloque la redéfinition, on utilise une propriété custom
          (file as any).customPath = entry.fullPath.substring(1);
        }
        filesToProcess.push(file);
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readAllEntries = async (): Promise<any[]> => {
          let allEntries: any[] = [];
          const readBatch = async () => {
            const entries = await new Promise<any[]>((resolve) => dirReader.readEntries(resolve));
            if (entries.length > 0) {
              allEntries = allEntries.concat(entries);
              await readBatch();
            }
          };
          await readBatch();
          return allEntries;
        };
        const entries = await readAllEntries();
        for (const child of entries) {
          await getFilesFromEntry(child);
        }
      }
    };

    const promises = [];
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      const item = e.dataTransfer.items[i];
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          promises.push(getFilesFromEntry(entry));
        }
      }
    }

    await Promise.all(promises);

    if (filesToProcess.length > 0) {
      isAppendingRef.current = false; // Drag and drop replaces everything
      handleFileChange({ target: { files: filesToProcess } } as any);
    }
  }

  const tousParses = files.length > 0 && files.every((f) => f.statut === "ok");
  const enCours = files.filter((f) => f.statut === "parsing").length;

  // Meilleur candidat pour un slot : un DCE contient souvent plusieurs fichiers du même type
  // (CCTP à la racine + CCTP dans un sous-dossier « AWS-MPI-… »). On affiche celui dont le nom
  // est le plus explicite, pas le premier de la liste.
  const bestFor = (type: string) =>
    files
      .filter((f) => f.type === type)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  const hasRC = files.some(f => f.type === "RC");
  const hasCCTP = files.some(f => f.type === "CCTP");
  const hasCCAP = files.some(f => f.type === "CCAP");
  const hasBPU = files.some(f => f.type === "BPU / DPGF");
  const isPrerequisOk = hasRC && hasCCTP && hasCCAP && hasBPU;
  // Info utile (anneau « n/6 ») : nombre de prérequis déjà marqués présents dans la liste
  // ci-dessous (mêmes 6 types, même règle que bestFor). Purement informatif.
  const nbPrerequisPresents = ["CCTP", "RC", "CCAP", "Compte Rendu", "BPU / DPGF", "Mémoire (cadre)"].filter((t) =>
    files.some((f) => f.type === t),
  ).length;

  let missingReason = "";
  if (!tousParses) {
    missingReason = "Fichiers en cours d'analyse...";
  } else if (!isPrerequisOk) {
    const missing = [];
    if (!hasRC) missing.push("RC");
    if (!hasCCTP) missing.push("CCTP");
    if (!hasCCAP) missing.push("CCAP");
    if (!hasBPU) missing.push("BPU / DPGF");
    missingReason = `Prérequis manquants : ${missing.join(", ")}`;
  }

  function terminerParsing() {
    setFiles((prev) => prev.map((f) => (f.statut === "parsing" ? { ...f, statut: "ok" } : f)));
  }
  function setType(nom: string, type: string) {
    // Correction manuelle : elle prime sur toute détection automatique pour le choix du slot.
    setFiles((prev) => prev.map((f) => (f.nom === nom ? { ...f, type, score: 100 } : f)));
  }
  function remove(nom: string) {
    setFiles((prev) => prev.filter((f) => f.nom !== nom));
  }

  async function saveDossier(isBrouillon: boolean): Promise<string> {
    if (!dossierIdRef.current) dossierIdRef.current = crypto.randomUUID();
    const dossierId = dossierIdRef.current;

    // Extraire le nom du dossier DCE depuis les chemins des fichiers uploadés
    let dossierName = "";
    for (const f of files) {
      if (f.nom.includes("/")) {
        // Le premier segment du chemin est le nom du dossier DCE
        dossierName = f.nom.split("/")[0];
        break;
      }
    }
    // Nettoyer le nom (enlever "DCE" redondant au début, etc.)
    if (dossierName) {
      dossierName = dossierName.replace(/^DCE\s*/i, "").trim();
    }

    const newDossier = {
      id: dossierId,
      objet: dossierName || "Dossier " + new Date().toLocaleDateString("fr-FR"),
      lots: [],
      dateLimite: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString(),
      statut: isBrouillon ? "Brouillon" : "En cours",
      responsable: "Sacha",
      dce_files: files.map(f => ({ ...f, file: undefined })),
    };

    try {
      await apiFetch("/api/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDossier),
      });
    } catch (e) {
      console.error("Impossible de sauvegarder le dossier sur le serveur", e);
    }

    return dossierId;
  }

  function handleQuit() {
    if (files.length > 0) {
      setShowQuitModal(true);
    } else {
      router.push("/");
    }
  }

  const isQuittingRef = useRef(false);

  async function handleConfirmQuit(save: boolean) {
    if (isQuittingRef.current) return;
    isQuittingRef.current = true;
    if (save) {
      await saveDossier(true);
    } else if (dossierIdRef.current) {
      // Le brouillon a pu être enregistré automatiquement entre-temps : « Non » doit réellement
      // l'annuler, sinon la question posée à l'utilisateur n'aurait plus de sens.
      try {
        await apiFetch(`/api/dossiers/${dossierIdRef.current}`, { method: "DELETE" });
      } catch {
        /* Sans gravité : le brouillon restera dans la liste et reste supprimable à la main. */
      }
    }
    router.push("/");
  }

  // ── Enregistrement automatique en brouillon (point 5 des retours GSS) ─────────────────
  // Dès qu'une pièce est déposée, le dossier est enregistré comme « Brouillon » et tenu à jour
  // à chaque changement. Il survit donc à la fermeture de l'onglet ou à un plantage, ce que la
  // fenêtre de confirmation ne permettait pas (0 brouillon sur 101 dossiers en production).
  // Au lancement, le même identifiant est réutilisé : le brouillon devient « En cours ».
  useEffect(() => {
    if (files.length === 0) return;                    // rien à enregistrer
    if (isLaunching || isQuittingRef.current) return;  // le lancement / la sortie s'en charge
    const timer = setTimeout(() => { void saveDossier(true); }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, isLaunching]);

  async function handleLaunch() {
    if (isLaunching) return;
    setIsLaunching(true);
    const dossierId = await saveDossier(false);
    
    // Uploader les fichiers vers le backend
    try {
      const formData = new FormData();
      formData.append("id", dossierId);
      files.forEach((f) => {
        if (f.file) {
          // Conserve le chemin relatif (upload de dossier) → sous-dossiers préservés côté backend.
          const relPath =
            (f.file as any).webkitRelativePath ||
            (f.file as any).customPath ||
            f.file.name;
          formData.append("files", f.file, relPath);
        }
      });
      const res = await apiFetch("/api/dce/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        console.warn("Erreur lors de l'envoi des fichiers au serveur.");
      } else {
        // Détection des infos manquantes UNE SEULE FOIS, ici après l'upload/analyse. On la lance
        // en tâche de fond (keepalive → survit à la navigation) ; la fiche dossier se contente de
        // l'afficher. keepalive garde la requête vivante même après le router.push.
        apiFetch(`/api/dossiers/${dossierId}/detect-missing`, {
          method: "POST",
          keepalive: true,
        }).catch(() => {});
      }
    } catch (e) {
      console.error("Impossible de joindre le serveur pour l'upload", e);
    }

    router.push(`/dossiers/${dossierId}`);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="mx-auto flex w-full max-w-[1008px] animate-monter flex-wrap items-end justify-between gap-4 px-4 pb-2 pt-6 md:px-6 md:pt-[30px]">
        <div className="min-w-0 max-w-2xl">
          <div aria-hidden="true" className="mb-1 flex items-center gap-1 text-[12.5px] text-subtle-foreground">
            Dossiers <ChevronRight className="h-3.5 w-3.5" /> Nouveau dossier
          </div>
          <h1 className="font-display text-[26px] font-bold leading-[1.1] text-foreground md:text-[28px]">Nouveau dossier — dépôt du DCE</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Déposez l'ensemble des pièces du Dossier de Consultation (PDF, DOCX, DOC). Le type de
            chaque pièce est détecté automatiquement.
          </p>
        </div>
        <Button variant="outline" onClick={handleQuit}>
          <X className="mr-2 h-4 w-4" /> Quitter
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4 md:px-6">
        <div className="apparait mx-auto max-w-[960px] space-y-5">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "group/depot flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-[border-color,background-color,box-shadow,transform] duration-200 ease-doux md:py-12",
              dragOver
                ? "scale-[1.01] border-primary bg-secondary shadow-o2"
                : "border-[#B9C5D4] bg-gradient-to-b from-card to-[#F8FAFC] hover:border-primary/50 hover:shadow-o2",
            )}
          >
            <div
              className={cn(
                "mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE8DC] text-signal ring-8 ring-[#FFF4EE] transition-transform duration-300 ease-doux",
                dragOver ? "-translate-y-1 scale-110" : "group-hover/depot:-translate-y-0.5",
              )}
            >
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="text-[15px] font-semibold text-foreground">Glissez-déposez le dossier DCE complet, des fichiers ou une archive ZIP</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              ou utilisez les boutons ci-dessous — les archives ZIP sont ouvertes automatiquement
            </div>
            <div aria-hidden="true" className="mt-3 flex flex-wrap justify-center gap-1.5">
              {["PDF", "DOCX", "DOC", "ZIP"].map((format) => (
                <span key={format} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                  {format}
                </span>
              ))}
            </div>
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
            />
            {/* Input specifically for Folder Upload */}
            <input 
              type="file" 
              multiple 
              // @ts-ignore - webkitdirectory is non-standard but works in all modern browsers
              webkitdirectory=""
              directory=""
              className="hidden" 
              ref={folderInputRef} 
              onChange={handleFileChange} 
            />
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button variant="outline" size="sm" onClick={() => { isAppendingRef.current = true; fileInputRef.current?.click(); }}>
                Fichier
              </Button>
              <Button variant="default" size="sm" onClick={() => { isAppendingRef.current = false; folderInputRef.current?.click(); }}>
                Déposer un dossier "DCE"
              </Button>
            </div>
          </div>

          {/* Required Slots */}
          <div className="rounded-xl border border-border bg-card px-4 py-5 shadow-o1 md:px-6">
            <div className="mb-4 flex items-center gap-4">
              <Anneau
                valeur={(nbPrerequisPresents / 6) * 100}
                ton={nbPrerequisPresents >= 5 ? "succes" : nbPrerequisPresents >= 3 ? "info" : "attente"}
              >
                {nbPrerequisPresents}/6
              </Anneau>
              <div className="min-w-0">
                <h2 className="font-display text-[19px] font-bold leading-tight text-foreground">Prérequis de l'IA</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {nbPrerequisPresents} pièce{nbPrerequisPresents > 1 ? "s" : ""} sur 6 détectée{nbPrerequisPresents > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="apparait grid gap-2.5 md:grid-cols-2">
              {[
                { type: "CCTP", label: "CCTP / CCP (Exigences techniques)", icon: Shield, missingBadge: "REQUIS", missingColor: "destructive" },
                { type: "RC", label: "Règlement de Consultation (RC)", icon: FileText, missingBadge: "REQUIS", missingColor: "destructive" },
                { type: "CCAP", label: "Cahier des Clauses Administratives Particulières (CCAP)", icon: FileText, missingBadge: "REQUIS", missingColor: "destructive" },
                { type: "Compte Rendu", label: "Rapport de Visite de Sacha", icon: Building2, missingBadge: "RECOMMANDÉ (60% VALEUR)", missingColor: "warning" },
                { type: "BPU / DPGF", label: "BPU / DPGF (Chiffrage)", icon: Table, missingBadge: "REQUIS", missingColor: "destructive" },
                { type: "Mémoire (cadre)", label: "Template Mémoire Client (.docx)", icon: Layers, missingBadge: "NON DÉTECTÉ", missingColor: "destructive" },
              ].map((slot) => {
                const foundFile = bestFor(slot.type);
                const Icon = slot.icon;
                
                if (foundFile) {
                  return (
                    <div key={slot.type} className="vive relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card px-3.5 py-3">
                      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-success-soft">
                        <Icon className="h-[18px] w-[18px] text-success" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold leading-snug text-foreground">{slot.label}</div>
                        {slot.type === "Mémoire (cadre)" && (
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            <span className="truncate">{foundFile.nom}</span>
                          </div>
                        )}
                      </div>
                      {slot.type === "Mémoire (cadre)" ? (
                        <div className="inline-flex shrink-0 animate-zoom-doux items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-semibold text-success">
                          ✓ DÉTECTÉ – MODE WORD A-Z
                        </div>
                      ) : (
                        <div className="inline-flex shrink-0 animate-zoom-doux items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-semibold text-success">
                          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" />
                          PRÉSENT
                        </div>
                      )}
                    </div>
                  );
                } else {
                  const isWarning = slot.missingColor === "warning";
                  return (
                    <div key={slot.type} className={cn("vive relative flex items-center gap-3 overflow-hidden rounded-xl border border-dashed px-3.5 py-3", isWarning ? "border-[#EBC88F] bg-warning-soft/40" : "border-[#E9B7BD] bg-destructive-soft/40")}>
                      <span aria-hidden="true" className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px]", isWarning ? "bg-warning-soft" : "bg-destructive-soft")}>
                        <Icon className={cn("h-[18px] w-[18px]", isWarning ? "text-warning" : "text-destructive")} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold leading-snug text-foreground">{slot.label}</div>
                      </div>
                      <div className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                        isWarning ? "bg-warning-soft text-warning" : "bg-destructive-soft text-destructive"
                      )}>
                        <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" />
                        {slot.missingBadge}
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>

          {/* Fichiers scannés */}
          {files.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-foreground">
                <FileText aria-hidden="true" className="h-[18px] w-[18px] text-primary" />
                Fichiers scannés dans le dossier
              </h2>
              <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[#FAFBFC] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {enCours > 0 && <PointActif />}
                  Tous les fichiers ({files.length})
                </div>
                {enCours > 0 && (
                  <Button size="sm" variant="outline" className="h-8 bg-card text-xs" onClick={terminerParsing}>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Forcer la fin du parsing
                  </Button>
                )}
              </div>
              <div className="divide-y divide-border max-h-60 overflow-y-auto">
                {files.map((f) => (
                  <div key={f.nom} className="flex animate-monter flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#F8FAFD] sm:flex-nowrap">
                    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary">
                      <FileText className="h-4 w-4 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{f.nom}</div>
                      <div className="text-xs text-muted-foreground">{f.taille}</div>
                    </div>

                    {/* Type détecté (éditable) */}
                    <select
                      value={f.type}
                      onChange={(e) => setType(f.nom, e.target.value)}
                      className="h-8 rounded-lg border border-input bg-card px-2 text-xs outline-none transition-[border-color,box-shadow] hover:border-[#B9C5D4]"
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    {/* Statut parsing */}
                    <div className="w-28 text-right">
                      {f.statut === "ok" && (
                        <span className="inline-flex animate-zoom-doux items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Analysé
                        </span>
                      )}
                      {f.statut === "parsing" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Parsing…
                        </span>
                      )}
                      {f.statut === "erreur" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-semibold text-destructive">
                          <AlertCircle className="h-3.5 w-3.5" /> Erreur
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => remove(f.nom)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                      title="Retirer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
            </div>
          )}

          {/* Action */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 shadow-o1 sm:flex-row sm:items-center sm:justify-between md:px-5">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
              {tousParses
                ? isPrerequisOk
                  ? "Tous les prérequis sont validés — vous pouvez lancer l'analyse complète."
                  : "Certains fichiers requis/recommandés sont manquants, mais vous pouvez tout de même forcer le lancement de l'analyse."
                : "Les fichiers doivent être parsés avant de pouvoir lancer l'analyse."}
            </p>
            {files.length > 0 && tousParses ? (
              <Button onClick={handleLaunch} disabled={isLaunching} className="h-11 shrink-0 px-5">
                {isLaunching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isLaunching ? "Lancement en cours..." : "Lancer l'analyse"}
              </Button>
            ) : (
              <div title={files.length === 0 ? "Ajoutez au moins un fichier" : `Bloqué — ${missingReason}`} className="shrink-0 cursor-help">
                <Button disabled className="pointer-events-none h-11 px-5">
                  <Sparkles className="h-4 w-4 mr-2" /> Lancer l'analyse
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmation pour quitter */}
      {showQuitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 animate-apparaitre bg-[rgba(11,37,69,.45)] backdrop-blur-[4px]" onClick={() => setShowQuitModal(false)} />
          <div className="relative z-10 mx-4 w-full max-w-md animate-zoom-doux rounded-2xl border border-border bg-card p-6 shadow-o3">
            <div aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary ring-8 ring-secondary/50">
              <Layers className="h-6 w-6" />
            </div>
            <h2 className="mb-2 text-center font-display text-xl font-bold">
              Sauvegarder en brouillon ?
            </h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Vous êtes sur le point de quitter la création. Voulez-vous conserver les fichiers actuels en tant que brouillon pour y revenir plus tard ?
            </p>
            <div className="flex flex-col gap-3">
              <Button variant="default" onClick={() => handleConfirmQuit(true)}>
                Oui, sauvegarder en brouillon
              </Button>
              <Button variant="outline" onClick={() => handleConfirmQuit(false)} className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
                Non, quitter sans sauvegarder
              </Button>
              <Button variant="ghost" onClick={() => setShowQuitModal(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
