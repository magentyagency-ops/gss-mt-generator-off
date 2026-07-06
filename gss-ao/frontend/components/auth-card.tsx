"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MailCheck } from "lucide-react";

type Mode = "login" | "signup";

export function AuthCard({ initialMode = "login" }: { initialMode?: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  // Champs partagés
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function switchMode(next: Mode) {
    setError(null);
    setMode(next);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : error.message === "Email not confirmed"
            ? "Email non confirmé — vérifie ta boîte mail."
            : error.message,
      );
      return;
    }
    router.push(redirect);
    router.refresh();
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSignupDone(true);
  }

  const inputCls =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="w-full max-w-sm">
      {/* Logo + titre */}
      <div className="mb-6 flex flex-col items-center gap-3">
        <img
          src="/gssAO.png"
          alt="GSS-AO"
          className="h-16 w-16 rounded-2xl object-contain shadow-sm ring-1 ring-border"
        />
        <div className="text-center">
          <h1 className="text-lg font-semibold">GSS-AO</h1>
          <p className="text-xs text-muted-foreground">Appels d&apos;offres</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        {/* Sélecteur glissant */}
        <div className="p-3">
          <div className="relative flex rounded-xl bg-muted p-1">
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-card shadow-sm transition-transform duration-300 ease-out",
                mode === "signup" && "translate-x-[100%]",
              )}
            />
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={cn(
                "relative z-10 flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                mode === "login" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={cn(
                "relative z-10 flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                mode === "signup" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Inscription
            </button>
          </div>
        </div>

        {/* Piste coulissante : connexion | inscription */}
        <div className="overflow-hidden">
          <div
            className="flex w-[200%] transition-transform duration-300 ease-out"
            style={{ transform: mode === "signup" ? "translateX(-50%)" : "translateX(0)" }}
          >
            {/* Panneau CONNEXION */}
            <div className="w-1/2 shrink-0 px-6 pb-6 pt-2">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Email</label>
                  <input
                    type="email"
                    required={mode === "login"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    placeholder="vous@exemple.fr"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Mot de passe</label>
                  <input
                    type="password"
                    required={mode === "login"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    placeholder="••••••••"
                  />
                </div>
                {mode === "login" && error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={loading && mode === "login"}>
                  {loading && mode === "login" ? "Connexion…" : "Se connecter"}
                </Button>
              </form>
            </div>

            {/* Panneau INSCRIPTION */}
            <div className="w-1/2 shrink-0 px-6 pb-6 pt-2">
              {signupDone ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                    <MailCheck className="h-6 w-6 text-success" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Un email de confirmation a été envoyé à{" "}
                    <span className="font-medium text-foreground">{email}</span>. Clique
                    sur le lien reçu pour activer ton compte.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSignupDone(false);
                      switchMode("login");
                    }}
                  >
                    Retour à la connexion
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Email</label>
                    <input
                      type="email"
                      required={mode === "signup"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputCls}
                      placeholder="vous@exemple.fr"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Mot de passe</label>
                    <input
                      type="password"
                      required={mode === "signup"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputCls}
                      placeholder="6 caractères minimum"
                    />
                  </div>
                  {mode === "signup" && error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={loading && mode === "signup"}>
                    {loading && mode === "signup" ? "Création…" : "Créer mon compte"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {mode === "login" ? (
          <>
            Pas encore de compte ?{" "}
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className="font-medium text-primary hover:underline"
            >
              Créer un compte
            </button>
          </>
        ) : (
          <>
            Déjà un compte ?{" "}
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="font-medium text-primary hover:underline"
            >
              Se connecter
            </button>
          </>
        )}
      </p>
    </div>
  );
}
