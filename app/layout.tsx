import type { Metadata } from "next";
import AuthProvider from "../components/AuthProvider";
import BannerInadimplente from "../components/BannerInadimplente";
import VersionChecker from "../components/VersionChecker";
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
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('arato-theme');document.documentElement.setAttribute('data-theme',t||'light')}catch(e){}})()`;

// Script de registro do Service Worker
const SW_SCRIPT = `(function(){if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});})}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: SW_SCRIPT }} />
        <meta name="theme-color" content="#1A4870" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
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
