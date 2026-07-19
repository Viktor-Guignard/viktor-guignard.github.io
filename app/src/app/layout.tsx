import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elomty & Didi — recherche de CDI",
  description: "Recherche d'offres CDI et suivi de candidatures, deux espaces séparés.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
