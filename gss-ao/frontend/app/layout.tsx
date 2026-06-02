// Layout racine — scaffold minimal (itération 1).

export const metadata = {
  title: "GSS-AO",
  description: "Automatisation du traitement des appels d'offres GSS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
