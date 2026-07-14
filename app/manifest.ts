import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arato Campo",
    short_name: "Arato Campo",
    description: "Registre operações de campo — plantio, pulverização, colheita, abastecimento",
    start_url: "/campo",
    scope: "/campo",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1A4870",
    theme_color: "#1A4870",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
