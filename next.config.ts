import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-forge", "pdfkit", "nfe-danfe-pdf"],
  outputFileTracingIncludes: {
    "/api/fiscal/danfe": [
      "./node_modules/nfe-danfe-pdf/**/*",
      "./node_modules/pdfkit/js/data/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
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
