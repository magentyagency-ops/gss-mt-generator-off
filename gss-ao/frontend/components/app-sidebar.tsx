"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FolderKanban,
  Radar,
  Settings,
  Mail,
  Inbox,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "Dossiers", icon: FolderKanban, match: (p: string) => p === "/" || p.startsWith("/dossiers") },
  { href: "/sollicitations", label: "Sollicitations", icon: Mail, match: (p: string) => p.startsWith("/sollicitations") },
  { href: "/inbox", label: "Boîte de réception", icon: Inbox, match: (p: string) => p.startsWith("/inbox") },
  { href: "/veille", label: "Veille", icon: Radar, match: (p: string) => p.startsWith("/veille") },
  { href: "/parametres", label: "Paramètres", icon: Settings, match: (p: string) => p.startsWith("/parametres") },
];

const ADMIN_NAV = {
  href: "/admin",
  label: "Administration",
  icon: ShieldCheck,
  match: (p: string) => p.startsWith("/admin"),
};

export function AppSidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
        .then(({ data: profile }) => setIsAdmin(profile?.role === "admin"));
    });
  }, []);

  const items = isAdmin ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <aside className="relative z-20 flex h-screen w-16 shrink-0 flex-col bg-sidebar px-2 py-5 text-sidebar-foreground md:w-[248px] md:px-3.5">
      <div className="mb-3 flex items-center justify-center gap-3 border-b border-white/[0.08] px-0 pb-5 pt-1 md:justify-start md:px-2.5">
        <span className="block h-[38px] w-[38px] shrink-0 overflow-hidden rounded-[10px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
          <img
            src="/gssAO.png"
            alt="GSS-AO"
            className="h-full w-full origin-[50%_37.5%] scale-[1.9] object-contain"
          />
        </span>
        <div className="sr-only leading-tight md:not-sr-only">
          <div className="font-display text-[17px] font-bold tracking-[0.02em] text-white">GSS-AO</div>
          <div className="text-xs text-sidebar-muted">Appels d'offres</div>
        </div>
      </div>

      <nav className="gss-nav-laterale relative flex-1 space-y-1">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-actif={active}
              title={item.label}
              className={cn(
                "group flex h-11 items-center justify-center gap-3 rounded-[9px] px-3 text-[14.5px] font-medium transition-[background-color,color,scale] duration-150 ease-doux focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70 md:justify-start",
                active
                  ? "bg-white/[0.12] text-white"
                  : "text-sidebar-foreground hover:bg-white/[0.07] hover:text-white active:bg-white/[0.1]",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0 opacity-90 transition-transform duration-200 ease-doux group-hover:scale-105" />
              <span className="sr-only md:not-sr-only">{item.label}</span>
            </Link>
          );
        })}
        <span aria-hidden="true" className="gss-nav-indicateur" />
      </nav>

      <div className="mt-auto hidden px-2.5 pt-4 text-[11.5px] leading-snug text-sidebar-muted/80 md:block">
        Global Security Services
      </div>
    </aside>
  );
}
