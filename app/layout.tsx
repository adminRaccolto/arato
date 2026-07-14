import type { Metadata } from "next";
import AuthProvider from "../components/AuthProvider";
import BannerInadimplente from "../components/BannerInadimplente";
import VersionChecker from "../components/VersionChecker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arato",
  description: "Menos cliques, mais campo",
};

// Script inline que aplica o tema ANTES da primeira pintura — elimina flash
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('arato-theme');document.documentElement.setAttribute('data-theme',t||'light')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      {/* eslint-disable-next-line react/no-danger */}
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
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
