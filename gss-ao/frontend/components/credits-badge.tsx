"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Pastille « crédits restants » (générations de mémoires) pour les en-têtes.
 * Lit le profil de l'utilisateur courant via la RLS (profiles_select_own).
 * Couleurs explicites → lisible sur le bandeau marine du dossier (pastille translucide
 * avec mini-jauge des crédits restants, qui se remplit à l'affichage).
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
        "inline-flex animate-zoom-doux items-center gap-2.5 rounded-[10px] border px-3 py-1.5 text-xs font-semibold text-white",
        empty
          ? "border-[rgba(241,90,34,0.65)] bg-[rgba(241,90,34,0.18)]"
          : "border-white/[0.14] bg-white/[0.09]",
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-[#FFB08A]" />
      <span className="flex min-w-[92px] flex-col gap-1">
        <span className="tabular-nums">
          {remaining} crédit{remaining > 1 ? "s" : ""}
          <span className="ml-1 font-normal text-[#AFC0D6]">/ {data.limit}</span>
        </span>
        <span aria-hidden="true" className="block h-1 w-full overflow-hidden rounded-full bg-white/15">
          <span
            className="block h-full origin-left animate-remplir rounded-full bg-[linear-gradient(90deg,#FFB08A,hsl(var(--signal)))] transition-[width] duration-[400ms] ease-doux"
            style={{ width: `${Math.min(100, (remaining / Math.max(data.limit, 1)) * 100)}%` }}
          />
        </span>
      </span>
    </div>
  );
}
