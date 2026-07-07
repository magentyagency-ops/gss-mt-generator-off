"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, RefreshCw, Check, RotateCcw, Users } from "lucide-react";
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
        <header className="border-b border-border bg-card px-6 py-4">
          <h1 className="text-xl font-semibold">Administration</h1>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="max-w-md">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="h-6 w-6 text-destructive" />
              </div>
              <h2 className="text-lg font-semibold">Accès refusé</h2>
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
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Administration</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} utilisateur{users.length > 1 ? "s" : ""} · quotas de génération
            de mémoires techniques
          </p>
        </div>
        <Button
          onClick={load}
          disabled={loading}
          className="bg-white text-black hover:bg-zinc-200"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Rafraîchir
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-primary" /> Utilisateurs
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
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
                        <TableCell className="font-medium">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === "admin" ? "default" : "outline"}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.email_confirmed ? (
                            <span className="text-success">Oui</span>
                          ) : (
                            <span className="text-warning">Non</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={atLimit ? "font-medium text-destructive" : ""}>
                            {u.generation_count}
                          </span>
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
                            className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      </div>
    </div>
  );
}
