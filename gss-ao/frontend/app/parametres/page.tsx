"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCircle, LogOut, Sparkles } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

interface Quota {
  role: string;
  used: number;
  limit: number;
}

export default function ParametresPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      setEmail(user?.email ?? null);
      if (!user) return;
      supabase
        .from("profiles")
        .select("role, generation_count, generation_limit")
        .eq("id", user.id)
        .single()
        .then(({ data: p }) => {
          if (p) setQuota({ role: p.role, used: p.generation_count, limit: p.generation_limit });
        });
    });
  }, []);

  const remaining = quota ? Math.max(quota.limit - quota.used, 0) : 0;
  const pct = quota && quota.limit > 0 ? Math.min((quota.used / quota.limit) * 100, 100) : 0;

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Configuration générale de l'application GSS-AO.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Compte */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCircle className="h-5 w-5 text-primary" /> Compte
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {email ?? "Chargement…"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Connecté à GSS-AO
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  {signingOut ? "Déconnexion…" : "Se déconnecter"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quota de génération */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-primary" /> Générations de mémoires
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!quota ? (
                <p className="text-sm text-muted-foreground">Chargement…</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">Crédits restants</span>
                    <span className="text-2xl font-semibold">
                      {remaining}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        / {quota.limit}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        remaining === 0
                          ? "h-full rounded-full bg-destructive transition-all"
                          : "h-full rounded-full bg-primary transition-all"
                      }
                      style={{ width: `${100 - pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {quota.used} génération{quota.used > 1 ? "s" : ""} utilisée
                    {quota.used > 1 ? "s" : ""} sur {quota.limit}.
                    {remaining === 0 &&
                      " Quota atteint — contactez un administrateur pour l'augmenter."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
