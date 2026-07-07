import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Assets estáticos: cache longo (imutável após build)
        source: "/:path*\\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Páginas HTML/JSON/API: sempre busca versão atual
        source: "/((?!_next/static|_next/image|favicon.ico|api/).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
