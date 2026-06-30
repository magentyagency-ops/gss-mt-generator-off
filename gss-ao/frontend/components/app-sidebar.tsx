"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  Radar,
  Library,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dossiers", icon: FolderKanban, match: (p: string) => p === "/" || p.startsWith("/dossiers") },
  { href: "/veille", label: "Veille", icon: Radar, match: (p: string) => p.startsWith("/veille") },
  { href: "/base", label: "Base de connaissances", icon: Library, match: (p: string) => p.startsWith("/base") },
  { href: "/parametres", label: "Paramètres", icon: Settings, match: (p: string) => p.startsWith("/parametres") },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <img src="/gssAO.png" alt="GSS-AO" className="h-8 w-8 rounded-md object-contain" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">GSS-AO</div>
          <div className="text-[11px] text-muted-foreground">Appels d'offres</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>


    </aside>
  );
}
