import type { Metadata } from "next";
import AuthProvider from "../components/AuthProvider";
import ConfirmarAcaoHost from "../components/ConfirmarAcao";
import BannerInadimplente from "../components/BannerInadimplente";
import VersionChecker from "../components/VersionChecker";
import Footer from "../components/Footer";
import SidebarAtalhos from "../components/SidebarAtalhos";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arato — Gestão Agrícola",
  description: "Menos cliques, mais campo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arato",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

// Script inline que aplica o tema ANTES da primeira pintura — elimina flash
const THEME_SCRIPT = `(function(){try{document.documentElement.setAttribute('data-theme','light');localStorage.removeItem('arato-theme');var p=localStorage.getItem('arato-palette')||'default';document.documentElement.setAttribute('data-palette',p);}catch(e){}})();`

// Desregistra qualquer Service Worker que ainda esteja instalado no navegador
// de quem usou o módulo de campo antigo (o sw.js foi removido junto com ele).
const SW_SCRIPT = `(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.getRegistrations().then(function(regs){
      regs.forEach(function(reg){ reg.unregister().catch(function(){}); });
    }).catch(function(){});
  });
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: SW_SCRIPT }} />
        <meta name="theme-color" content="#111111" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", minHeight: "100vh", paddingBottom: 28 }}>
        <AuthProvider>
          <ConfirmarAcaoHost />
          <BannerInadimplente />
          <VersionChecker />
          <SidebarAtalhos />
          <div style={{ paddingLeft: "var(--sidebar-w, 0px)", transition: "padding-left 0.2s ease" }}>
            {children}
          </div>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
