"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Pastille « crédits restants » (générations de mémoires) pour les en-têtes.
 * Lit le profil de l'utilisateur courant via la RLS (profiles_select_own).
 * Couleurs explicites → lisible sur l'en-tête noir de l'app.
 */
export function CreditsBadge({ className }: { className?: string }) {
  const [data, setData] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("generation_count, generation_limit")
        .eq("id", user.id)
        .single()
        .then(({ data: p }) => {
          if (p) setData({ used: p.generation_count, limit: p.generation_limit });
        });
    });
  }, []);

  if (!data) return null;
  const remaining = Math.max(data.limit - data.used, 0);
  const empty = remaining === 0;

  return (
    <div
      title={`${data.used} / ${data.limit} générations utilisées`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        empty
          ? "border-red-400/40 bg-red-500/15 text-red-300"
          : "border-white/20 bg-white/10 text-white",
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />
      <span>
        {remaining} crédit{remaining > 1 ? "s" : ""}
        <span className="ml-1 opacity-60">/ {data.limit}</span>
      </span>
    </div>
  );
}
