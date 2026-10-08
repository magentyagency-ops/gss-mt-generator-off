"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Clock, AlertTriangle, Trash2, X, Hourglass, Mail, Send } from "lucide-react";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import {
  STATUT_VARIANT,
  type Statut,
  type DossierRow,
  formatDate,
  joursRestants,
} from "@/lib/gss-config";
import { cn } from "@/lib/utils";
import { useIntro } from "@/components/intro-provider";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { Indicateur, Initiales } from "@/components/visuel/carte";
import { Compteur } from "@/components/visuel/compteur";
import { Jauge } from "@/components/visuel/jauge";
import { IndicateurGlissant } from "@/components/visuel/indicateur-glissant";
import { PointActif } from "@/components/visuel/pastille-statut";

const STATUTS: (Statut | "Tous")[] = ["Tous", "Brouillon", "En cours", "À valider", "Envoyé"];

export default function DossiersPage() {
  const { introFinished } = useIntro();
  const isInitialLoad = !introFinished;

  const [filtre, setFiltre] = useState<Statut | "Tous">("Tous");
  const [recherche, setRecherche] = useState("");
  const [dossiers, setDossiers] = useState<DossierRow[]>([]);
  const [supprimerDossier, setSupprimerDossier] = useState<DossierRow | null>(null);

  useEffect(() => {
    apiFetch("/api/dossiers")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDossiers(data);
      })
      .catch((e) => console.error(e));
  }, []);

  // ── Sollicitations « en attente de réponse » par dossier (front, en parallèle) ────
  // Requête Supabase SÉPARÉE (indépendante du chargement des dossiers ci-dessus).
  // La RLS scope déjà à l'utilisateur connecté → aucun filtre user_id.
  // Règle « en attente » : reponse_recue_at IS NULL ET statut IN ('envoyee','reponse_en_attente').
  // Exclut a_envoyer (pas encore envoyée), reponse_recue et validee (déjà répondues).
  // Robustesse : toute erreur laisse la map vide → aucun badge, la liste s'affiche normalement.
  const [enAttenteByDossier, setEnAttenteByDossier] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("question_interne")
          .select("ao_id, statut, reponse_recue_at");
        if (annule || error || !Array.isArray(data)) return;
        const m = new Map<string, number>();
        for (const q of data as { ao_id: string; statut: string; reponse_recue_at: string | null }[]) {
          const enAttente =
            q.reponse_recue_at == null &&
            (q.statut === "envoyee" || q.statut === "reponse_en_attente");
          if (enAttente && q.ao_id) m.set(q.ao_id, (m.get(q.ao_id) ?? 0) + 1);
        }
        setEnAttenteByDossier(m);
      } catch {
        /* échec silencieux : pas de badge, la liste des dossiers reste intacte */
      }
    })();
    return () => { annule = true; };
  }, []);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [supprimerMultiple, setSupprimerMultiple] = useState(false);

  const lignes = useMemo(() => {
    return dossiers
      .filter((d) => filtre === "Tous" || d.statut === filtre)
      .filter((d) => (d.acheteur || "").toLowerCase().includes(recherche.toLowerCase()) || (d.objet || "").toLowerCase().includes(recherche.toLowerCase()))
      .sort((a, b) => +new Date(a.dateLimite || 0) - +new Date(b.dateLimite || 0));
  }, [filtre, recherche, dossiers]);

  const handleSupprimer = useCallback(() => {
    if (!supprimerDossier) return;
    setDossiers((prev) => prev.filter((d) => d.id !== supprimerDossier.id));
    apiFetch(`/api/dossiers/${supprimerDossier.id}`, {
      method: "DELETE",
    }).catch((e) => console.error(e));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(supprimerDossier.id);
      return next;
    });
    setSupprimerDossier(null);
  }, [supprimerDossier]);

  const handleSupprimerMultiple = useCallback(() => {
    setDossiers((prev) => prev.filter((d) => !selectedIds.has(d.id)));
    
    // Call delete API for each selected
    Array.from(selectedIds).forEach((id) => {
      apiFetch(`/api/dossiers/${id}`, {
        method: "DELETE",
      }).catch((e) => console.error(e));
    });
    setSelectedIds(new Set());
    setSupprimerMultiple(false);
  }, [selectedIds]);

  const allSelected = lignes.length > 0 && lignes.every((d) => selectedIds.has(d.id));
  const someSelected = lignes.some((d) => selectedIds.has(d.id)) && !allSelected;

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        lignes.forEach((d) => next.delete(d.id));
      } else {
        lignes.forEach((d) => next.add(d.id));
      }
      return next;
    });
  }, [allSelected, lignes]);

  /* ── Animation delays (stagger) ─────────────────────────────── */
  const headerDelay  = isInitialLoad ? 2800 : 0;
  const filterDelay  = isInitialLoad ? 2900 : 100;
  const tableDelay   = isInitialLoad ? 3000 : 200;
  const rowDelay = (index: number) =>
    isInitialLoad ? 3100 + index * 100 : 300 + index * 50;

  /* ── Infos utiles (purement informatives) : calculées sur la liste déjà chargée
     (`dossiers`, `enAttenteByDossier`), aucune requête, aucune incidence sur la table. ── */
  const nbEnCours = dossiers.filter((d) => d.statut === "En cours").length;
  const attenteParDossier = dossiers.map((d) => enAttenteByDossier.get(d.id) ?? 0);
  const nbDossiersEnAttente = attenteParDossier.filter((n) => n > 0).length;
  const nbSollicitationsEnAttente = attenteParDossier.reduce((t, n) => t + n, 0);
  const prochaineEcheance = dossiers
    .filter((d) => d.statut !== "Envoyé" && !!d.dateLimite && !isNaN(new Date(d.dateLimite).getTime()))
    .map((d) => ({ d, jours: joursRestants(d.dateLimite) }))
    .filter((x) => x.jours >= 0)
    .sort((a, b) => a.jours - b.jours)[0];
  const nbEnvoyes = dossiers.filter((d) => d.statut === "Envoyé").length;
  // « Terminé » : même règle que la pastille de la table (À valider, sans sollicitation en attente).
  const nbTermines = dossiers.filter((d) => d.statut === "À valider" && !(enAttenteByDossier.get(d.id) ?? 0)).length;
  const kpiDelay = (rang: number) => filterDelay + rang * 60;
  const kpiClass = "opacity-0 animate-fade-in-up max-sm:gap-0 max-sm:px-3.5 max-sm:py-3 max-sm:[&>span:first-child]:hidden";

  return (
    <div className="flex h-full flex-col">
      <header
        className="opacity-0 animate-fade-in-up flex flex-wrap items-end justify-between gap-4 px-4 pb-2 pt-6 md:px-9 md:pt-[30px]"
        style={{ animationDelay: `${headerDelay}ms` }}
      >
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-bold leading-[1.1] text-foreground md:text-[28px]">Dossiers d&apos;appels d&apos;offres</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dossiers.length} dossiers · {dossiers.filter((d) => d.statut === "En cours").length} en
            cours de traitement
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setSupprimerMultiple(true)}
              className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Supprimer ({selectedIds.size})</span>
            </Button>
          )}
          <Link href="/dossiers/nouveau">
            <Button>
              <Plus className="h-4 w-4" /> Nouveau dossier
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-9">
        {/* Indicateurs (infos utiles calculées sur la liste affichée) */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-4">
          <Indicateur
            className={kpiClass}
            style={{ animationDelay: `${kpiDelay(0)}ms` }}
            icone={Hourglass}
            libelle="En cours"
            valeur={<Compteur valeur={nbEnCours} />}
            detail={`sur ${dossiers.length} dossier${dossiers.length > 1 ? "s" : ""}`}
          />
          <Indicateur
            className={kpiClass}
            style={{ animationDelay: `${kpiDelay(1)}ms` }}
            icone={Mail}
            libelle="En attente de réponses"
            valeur={<Compteur valeur={nbDossiersEnAttente} />}
            detail={`${nbSollicitationsEnAttente} sollicitation${nbSollicitationsEnAttente > 1 ? "s" : ""} en attente`}
          />
          <Indicateur
            className={kpiClass}
            style={{ animationDelay: `${kpiDelay(2)}ms` }}
            icone={Clock}
            libelle="Prochaine échéance"
            alerte={!!prochaineEcheance && prochaineEcheance.jours <= 14}
            valeur={prochaineEcheance ? <Compteur valeur={prochaineEcheance.jours} prefixe="J−" /> : "—"}
            detail={
              prochaineEcheance
                ? prochaineEcheance.d.acheteur || prochaineEcheance.d.objet || "Dossier en cours de traitement…"
                : "Aucune échéance à venir"
            }
          />
          <Indicateur
            className={kpiClass}
            style={{ animationDelay: `${kpiDelay(3)}ms` }}
            icone={Send}
            libelle="Envoyés"
            valeur={<Compteur valeur={nbEnvoyes} />}
            detail={`et ${nbTermines} terminé${nbTermines > 1 ? "s" : ""}`}
          />
        </div>

        {/* Filtres */}
        <div
          className="opacity-0 animate-fade-in-up mb-4 flex flex-wrap items-center justify-between gap-3"
          style={{ animationDelay: `${filterDelay}ms` }}
        >
          <div className="relative isolate flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] bg-[#E9EDF3] p-1">
            <IndicateurGlissant groupe="filtres-dossiers" />
            {STATUTS.map((s) => (
              <button
                key={s}
                onClick={() => setFiltre(s)}
                data-actif={filtre === s}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] transition-colors",
                  filtre === s
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:bg-white/50 hover:text-foreground",
                )}
              >
                {s}
                <small className="font-mono text-[11px] font-medium tabular-nums text-subtle-foreground">
                  {s === "Tous" ? dossiers.length : dossiers.filter((d) => d.statut === s).length}
                </small>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un acheteur…"
              className="h-10 w-full rounded-[9px] border border-input bg-card pl-9 pr-3 text-sm shadow-o1 outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#B9C5D4]"
            />
          </div>
        </div>

        {/* Tableau */}
        <div
          className="opacity-0 animate-fade-in-up overflow-hidden rounded-xl border border-border bg-card shadow-o1"
          style={{ animationDelay: `${tableDelay}ms` }}
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40px] pl-5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input bg-background text-primary accent-primary"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Acheteur</TableHead>
                <TableHead>Objet</TableHead>
                <TableHead>Lots</TableHead>
                <TableHead>Date limite</TableHead>
                <TableHead>Statut</TableHead>

                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.map((d, index) => {
                const jours = joursRestants(d.dateLimite);
                const urgent = jours <= 14 && d.statut !== "Envoyé";
                const isSelected = selectedIds.has(d.id);
                return (
                  <TableRow
                    key={d.id}
                    className={cn(
                      "opacity-0 animate-fade-in-up ligne-vive group cursor-pointer",
                      isSelected && "bg-secondary"
                    )}
                    style={{ animationDelay: `${rowDelay(index)}ms` }}
                    onClick={() => window.location.href = `/dossiers/${d.id}`}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()} className="py-[13px] pl-5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-input bg-background text-primary accent-primary"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(d.id)) next.delete(d.id);
                          else next.add(d.id);
                          setSelectedIds(next);
                        }}
                      />
                    </TableCell>
                    <TableCell className="min-w-[200px] py-[13px] font-semibold text-foreground">
                      <div className="flex items-center gap-3">
                        {d.acheteur || d.objet ? (
                          <Initiales texte={d.acheteur || d.objet} />
                        ) : (
                          <span aria-hidden="true" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-signal-soft">
                            <PointActif />
                          </span>
                        )}
                        <span className="min-w-0 leading-snug">
                          {d.acheteur || d.objet || "Dossier en cours de traitement…"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate py-[13px] text-muted-foreground">
                      {d.objet || "—"}
                    </TableCell>
                    <TableCell className="py-[13px]">
                      <div className="flex gap-1 flex-wrap">
                        {d.lots?.map((l: any, i: number) => (
                          <Badge key={i} variant="outline" className="whitespace-nowrap font-normal text-muted-foreground">
                            {l?.intitule || l}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-[13px]">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">{formatDate(d.dateLimite)}</span>
                        {d.statut !== "Envoyé" && (
                          <span
                            className={cn(
                              "mt-1 flex items-center gap-1.5 font-mono text-[11.5px] font-medium tabular-nums",
                              urgent ? (jours <= 7 ? "text-destructive" : "text-warning") : "text-subtle-foreground",
                            )}
                          >
                            <Jauge
                              valeur={Math.min(100, Math.max(6, (1 - jours / 35) * 100))}
                              ton={jours <= 7 ? "danger" : urgent ? "attente" : "neutre"}
                              epaisseur={4}
                              className="w-14"
                            />
                            {urgent ? (
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                            ) : (
                              <Clock className="h-3 w-3 shrink-0" />
                            )}
                            J−{jours}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-[13px]">
                      <div className="flex flex-col items-start gap-1">
                        {(() => {
                          const n = enAttenteByDossier.get(d.id) ?? 0;
                          if (n > 0) {
                            return (
                              <Badge variant="warning" className="font-normal whitespace-nowrap">
                                {n} en attente de réponse{n > 1 ? "s" : ""}
                              </Badge>
                            );
                          }
                          if (d.statut === "À valider") {
                            return <Badge variant="success">Terminé</Badge>;
                          }
                          return <Badge variant={STATUT_VARIANT[d.statut]}>{d.statut}</Badge>;
                        })()}
                      </div>
                    </TableCell>

                    <TableCell>
                      <button
                        id={`delete-dossier-${d.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSupprimerDossier(d);
                        }}
                        className="rounded-lg p-1.5 text-muted-foreground opacity-40 transition-all hover:bg-destructive-soft hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        title="Supprimer le dossier"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Modale de confirmation de suppression */}
      {supprimerDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 animate-apparaitre bg-[rgba(11,37,69,.45)] backdrop-blur-[4px] transition-opacity"
            onClick={() => setSupprimerDossier(null)}
          />
          {/* Contenu */}
          <div className="relative z-10 mx-4 w-full max-w-md animate-zoom-doux rounded-2xl border border-border bg-card p-6 shadow-o3">
            {/* Bouton fermer */}
            <button
              onClick={() => setSupprimerDossier(null)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Icône d'alerte */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive-soft ring-8 ring-destructive-soft">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>

            <h2 className="mb-1 text-center font-display text-xl font-bold">
              Supprimer ce dossier ?
            </h2>
            <p className="mb-2 text-center text-sm text-muted-foreground">
              Vous êtes sur le point de supprimer le dossier suivant :
            </p>
            <div className="mb-5 rounded-xl border border-border bg-secondary/60 px-4 py-3">
              <p className="text-sm font-medium">{supprimerDossier.acheteur}</p>
              <p className="text-xs text-muted-foreground">{supprimerDossier.objet}</p>
            </div>
            <p className="mb-5 text-center text-xs text-muted-foreground">
              Cette action est irréversible. Toutes les données associées seront définitivement perdues.
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                id="cancel-delete-dossier"
                variant="outline"
                className="flex-1"
                onClick={() => setSupprimerDossier(null)}
              >
                Annuler
              </Button>
              <Button
                id="confirm-delete-dossier"
                variant="destructive"
                className="flex-1"
                onClick={handleSupprimer}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de confirmation de suppression multiple */}
      {supprimerMultiple && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 animate-apparaitre bg-[rgba(11,37,69,.45)] backdrop-blur-[4px] transition-opacity"
            onClick={() => setSupprimerMultiple(false)}
          />
          <div className="relative z-10 mx-4 w-full max-w-md animate-zoom-doux rounded-2xl border border-border bg-card p-6 shadow-o3">
            <button
              onClick={() => setSupprimerMultiple(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive-soft ring-8 ring-destructive-soft">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>

            <h2 className="mb-1 text-center font-display text-xl font-bold">
              Supprimer {selectedIds.size} dossiers ?
            </h2>
            <p className="mb-5 text-center text-sm text-muted-foreground">
              Cette action est irréversible. Toutes les données associées seront définitivement perdues pour les dossiers sélectionnés.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSupprimerMultiple(false)}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleSupprimerMultiple}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer {selectedIds.size} dossiers
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

