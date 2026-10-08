"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";

// Routes affichées en plein écran (sans la barre latérale de l'app).
const BARE_ROUTES = ["/login", "/signup"];

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some((r) => pathname.startsWith(r));

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
