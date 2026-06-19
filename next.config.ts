import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Páginas HTML nunca ficam em cache — sempre busca versão atual
        source: "/((?!_next/static|_next/image|favicon.ico|api/).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
