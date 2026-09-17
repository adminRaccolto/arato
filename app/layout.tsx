import type { Metadata } from "next";
import AuthProvider from "../components/AuthProvider";
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

// Script de registro do Service Worker — só faz sentido pro App Campo (uso
// offline em campo). Registrado com scope "/" antes, ele interceptava TODA
// a navegação do site (Cache First em /_next/static/*, Network First com
// fallback em cache pras páginas) — inclusive telas administrativas que
// nunca precisaram de suporte offline, causando deploys que não apareciam
// pro usuário até o navegador decidir buscar um /sw.js "diferente" (o que
// não acontecia, já que o próprio arquivo sw.js quase nunca muda). Agora só
// registra dentro de /campo, com escopo restrito a /campo — e desregistra
// qualquer registro antigo de escopo amplo em qualquer outra página, pra
// corrigir quem já tinha o registro largo instalado de antes.
const SW_SCRIPT = `(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function(){
    var onCampo = window.location.pathname.indexOf('/campo') === 0;
    navigator.serviceWorker.getRegistrations().then(function(regs){
      var temEscopoCampo = false;
      regs.forEach(function(reg){
        if (onCampo && reg.scope && reg.scope.indexOf('/campo') !== -1) { temEscopoCampo = true; return; }
        reg.unregister().catch(function(){});
      });
      if (onCampo && !temEscopoCampo) {
        navigator.serviceWorker.register('/sw.js', { scope: '/campo/' }).catch(function(){});
      }
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
