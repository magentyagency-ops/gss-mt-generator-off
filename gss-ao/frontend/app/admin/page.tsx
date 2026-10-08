"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, RefreshCw, Check, RotateCcw, Users, BookUser, Trash2, Plus, AlertCircle, Sparkles, Gauge, Mail } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { EnTetePage } from "@/components/visuel/en-tete-page";
import { Indicateur, Initiales } from "@/components/visuel/carte";
import { Compteur } from "@/components/visuel/compteur";
import { Jauge } from "@/components/visuel/jauge";
import { PastilleStatut } from "@/components/visuel/pastille-statut";
import { Squelette } from "@/components/visuel/squelette";

interface AdminUser {
  id: string;
  email: string;
  role: "user" | "admin";
  generation_limit: number;
  generation_count: number;
  email_confirmed: boolean;
  created_at: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Valeur de limite en cours d'édition par utilisateur.
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // ── Rubrique Annuaire (collaborateurs pour le routage IA des questions internes, §11) ─────
  const [people, setPeople] = useState<Array<{ id: string; nom: string; fonction: string; email: string }>>([]);
  const [annForm, setAnnForm] = useState({ nom: "", fonction: "", email: "" });
  const [annErr, setAnnErr] = useState<string | null>(null);
  const [annSaving, setAnnSaving] = useState(false);

  const loadPeople = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("personne")
      .select("id, nom, fonction, email")
      .order("created_at", { ascending: true });
    if (!error) setPeople((data as any[]) ?? []);
  }, []);

  useEffect(() => { loadPeople(); }, [loadPeople]);

  async function addPersonne() {
    setAnnErr(null);
    if (!annForm.nom.trim() || !annForm.fonction.trim() || !annForm.email.trim()) {
      setAnnErr("Nom, fonction et e-mail sont requis.");
      return;
    }
    setAnnSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("personne").insert({
      nom: annForm.nom.trim(),
      fonction: annForm.fonction.trim(),
      email: annForm.email.trim(),
    });
    setAnnSaving(false);
    if (error) { setAnnErr(error.message); return; }
    setAnnForm({ nom: "", fonction: "", email: "" });
    await loadPeople();
  }

  async function removePersonne(id: string) {
    setAnnErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("personne").delete().eq("id", id);
    if (error) setAnnErr(error.message); else await loadPeople();
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_list_users");
    setLoading(false);
    if (error) {
      // La fonction lève « Non autorisé » si l'utilisateur n'est pas admin.
      if (/autoris/i.test(error.message)) setDenied(true);
      else setError(error.message);
      return;
    }
    setUsers((data as AdminUser[]) || []);
    setEdits({});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveLimit(u: AdminUser) {
    const newLimit = edits[u.id];
    if (newLimit === undefined || newLimit === u.generation_limit) return;
    if (newLimit < 0 || Number.isNaN(newLimit)) {
      setError("La limite doit être un entier ≥ 0.");
      return;
    }
    setSavingId(u.id);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_generation_limit", {
      p_user_id: u.id,
      p_new_limit: newLimit,
    });
    setSavingId(null);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  async function resetCount(u: AdminUser) {
    setSavingId(u.id);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_reset_generation_count", {
      p_user_id: u.id,
    });
    setSavingId(null);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  if (denied) {
    return (
      <div className="flex h-full flex-col">
        <EnTetePage className="animate-monter" titre="Administration" />
        <div className="flex flex-1 items-center justify-center px-4 py-8 md:p-9">
          <Card className="w-full max-w-md animate-monter shadow-o2 [animation-delay:80ms]">
            <CardContent className="flex flex-col items-center gap-3 px-8 py-12 text-center">
              <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-destructive-soft ring-8 ring-destructive-soft/50">
                <ShieldAlert className="h-8 w-8 text-destructive" strokeWidth={1.8} />
              </div>
              <h2 className="font-display text-[22px] font-bold">Accès refusé</h2>
              <p className="text-sm text-muted-foreground">
                Cette page est réservée aux administrateurs.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EnTetePage
        className="animate-monter"
        titre="Administration"
        sousTitre={
          <p>
            {users.length} utilisateur{users.length > 1 ? "s" : ""} · quotas de génération
            de mémoires techniques
          </p>
        }
        actions={
        <Button
          onClick={load}
          disabled={loading}
          variant="outline"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Rafraîchir
        </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-9">
        {error && (
          <div className="mb-5 flex animate-monter items-center gap-2.5 rounded-xl border border-destructive/25 bg-gradient-to-r from-destructive-soft to-card px-4 py-3 text-sm text-destructive">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Repères calculés sur les listes déjà chargées (aucune requête). */}
        <div className={`apparait mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "[&_.chiffre-cle]:opacity-30" : ""}`}>
          <Indicateur
            icone={Users}
            libelle="Utilisateurs"
            valeur={<Compteur valeur={users.length} />}
            detail="comptes de la plateforme"
          />
          <Indicateur
            icone={Sparkles}
            libelle="Générations utilisées"
            valeur={<Compteur valeur={users.reduce((total, u) => total + u.generation_count, 0)} />}
            detail="tous comptes confondus"
          />
          <Indicateur
            icone={Gauge}
            libelle="Quota atteint"
            valeur={<Compteur valeur={users.filter((u) => u.generation_count >= u.generation_limit).length} />}
            detail="compte(s) à la limite"
            alerte={users.some((u) => u.generation_count >= u.generation_limit)}
          />
          <Indicateur
            icone={BookUser}
            libelle="Collaborateurs"
            valeur={<Compteur valeur={people.length} />}
            detail="dans l'annuaire"
          />
        </div>

        <Card className="animate-monter [animation-delay:200ms]">
          <CardHeader>
            <CardTitle className="flex items-center gap-[9px] text-[15px]">
              <Users className="h-[18px] w-[18px] text-primary" /> Utilisateurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Email confirmé</TableHead>
                  <TableHead>Utilisés</TableHead>
                  <TableHead>Limite autorisée</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      <div aria-hidden="true" className="mb-4 space-y-3">
                        <Squelette className="h-4 w-full" />
                        <Squelette className="h-4 w-11/12" />
                        <Squelette className="h-4 w-4/5" />
                      </div>
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => {
                    const current = edits[u.id] ?? u.generation_limit;
                    const dirty = current !== u.generation_limit;
                    const atLimit = u.generation_count >= u.generation_limit;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Initiales texte={u.email} className="h-8 w-8 text-[11px]" />
                            <span className="truncate">{u.email}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.role === "admin" ? "default" : "outline"}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.email_confirmed ? (
                            <PastilleStatut ton="succes">Oui</PastilleStatut>
                          ) : (
                            <PastilleStatut ton="attente">Non</PastilleStatut>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[96px] space-y-1.5">
                          <span className={atLimit ? "font-mono text-[13px] font-semibold text-destructive" : "font-mono text-[13px] font-medium"}>
                            {u.generation_count}
                          </span>
                          <span aria-hidden="true" className="ml-1 font-mono text-[11.5px] text-subtle-foreground">/ {u.generation_limit}</span>
                          <Jauge
                            valeur={Math.min(100, (u.generation_count / Math.max(u.generation_limit, 1)) * 100)}
                            ton={atLimit ? "danger" : "marine"}
                            epaisseur={5}
                          />
                          </div>
                        </TableCell>
                        <TableCell>
                          <input
                            type="number"
                            min={0}
                            value={current}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [u.id]: e.target.value === "" ? 0 : parseInt(e.target.value, 10),
                              }))
                            }
                            className="h-9 w-24 rounded-[9px] border border-input bg-card px-2.5 font-mono text-sm outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#B9C5D4]"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveLimit(u)}
                              disabled={!dirty || savingId === u.id}
                            >
                              <Check className="h-4 w-4" />
                              Enregistrer
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Remettre le compteur d'utilisations à zéro"
                              onClick={() => resetCount(u)}
                              disabled={savingId === u.id || u.generation_count === 0}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Rubrique Annuaire : collaborateurs pour le routage IA des questions internes (§11) */}
        <Card className="mt-5 animate-monter [animation-delay:260ms]">
          <CardHeader>
            <CardTitle className="flex items-center gap-[9px] text-[15px]">
              <BookUser className="h-[18px] w-[18px] text-primary" /> Annuaire des collaborateurs
              <span className="rounded-full bg-secondary px-2 py-px font-mono text-xs font-medium text-muted-foreground">({people.length})</span>
            </CardTitle>
            <p className="text-[13px] text-muted-foreground">
              L'IA choisit, pour chaque question interne, la personne dont la fonction est la plus adaptée.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {annErr && (
              <div className="flex animate-monter items-center gap-2.5 rounded-xl border border-destructive/25 bg-gradient-to-r from-destructive-soft to-card px-3.5 py-2.5 text-sm text-destructive"><AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />{annErr}</div>
            )}
            <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-dashed border-[#C9D3DF] bg-[#FAFBFC] p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input className="h-10 rounded-[9px] border border-input bg-card px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#B9C5D4]" placeholder="Nom *"
                value={annForm.nom} onChange={(e) => setAnnForm((f) => ({ ...f, nom: e.target.value }))} />
              <input className="h-10 rounded-[9px] border border-input bg-card px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#B9C5D4]" placeholder="Fonction * (ex. Responsable RH)"
                value={annForm.fonction} onChange={(e) => setAnnForm((f) => ({ ...f, fonction: e.target.value }))} />
              <input className="h-10 rounded-[9px] border border-input bg-card px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#B9C5D4]" placeholder="E-mail *"
                value={annForm.email} onChange={(e) => setAnnForm((f) => ({ ...f, email: e.target.value }))} />
              <Button disabled={annSaving} onClick={addPersonne} className="h-10"><Plus className="h-4 w-4" /> Ajouter</Button>
            </div>
            {people.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border px-6 py-8 text-center">
                <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary"><BookUser className="h-6 w-6" strokeWidth={1.7} /></span>
                <p className="text-sm text-muted-foreground">Aucune personne. Ajoutez-en pour activer le routage IA.</p>
              </div>
            ) : (
              <div className="apparait grid gap-2.5 md:grid-cols-2">
                {people.map((p) => (
                  <div key={p.id} className="vive flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
                    <Initiales texte={p.nom} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.nom} — <span className="font-medium text-muted-foreground">{p.fonction}</span></div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground"><Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{p.email}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removePersonne(p.id)} className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
