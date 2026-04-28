import type { Metadata } from "next";
import AuthProvider from "../components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arato",
  description: "Menos cliques, mais campo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0 }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
