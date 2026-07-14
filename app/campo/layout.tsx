import type { Metadata, Viewport } from "next";
import CampoLayoutClient from "./CampoLayoutClient";

export const metadata: Metadata = {
  title: "Arato Campo",
  description: "Registre operações de campo — plantio, pulverização, colheita, abastecimento",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arato Campo",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: "/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A4870",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return <CampoLayoutClient>{children}</CampoLayoutClient>;
}
