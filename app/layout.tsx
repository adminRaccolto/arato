import type { Metadata } from "next";
import AuthProvider from "../components/AuthProvider";
import BannerInadimplente from "../components/BannerInadimplente";
import VersionChecker from "../components/VersionChecker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arato",
  description: "Menos cliques, mais campo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <AuthProvider>
          <BannerInadimplente />
          <VersionChecker />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
