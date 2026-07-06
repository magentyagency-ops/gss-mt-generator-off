import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppChrome } from "@/components/app-chrome";
import { IntroProvider } from "@/components/intro-provider";

export const metadata: Metadata = {
  title: "GSS-AO — Appels d'offres",
  description: "Automatisation du traitement des appels d'offres GSS",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      {/* Pour activer le mode sombre plus tard : ajouter className="dark" sur <html>. */}
      <body className="font-sans antialiased">
        <IntroProvider>
          <AppChrome>{children}</AppChrome>
        </IntroProvider>
      </body>
    </html>
  );
}
