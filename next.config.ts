import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const customHeaders = [
  { source: "/(.*)", headers: securityHeaders },
  {
    // Assets estáticos: cache longo (imutável após build)
    source: "/:path*\\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf)",
    headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
  },
  {
    // Service Worker: sem cache no browser (o SW se auto-atualiza via SW lifecycle)
    source: "/sw.js",
    headers: [
      { key: "Cache-Control", value: "no-cache" },
      { key: "Service-Worker-Allowed", value: "/" },
    ],
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-forge", "pdfkit", "nfe-danfe-pdf"],
  outputFileTracingIncludes: {
    "/api/fiscal/danfe": [
      "./node_modules/nfe-danfe-pdf/**/*",
      "./node_modules/pdfkit/js/data/**/*",
    ],
  },
  headers: () => Promise.resolve(customHeaders),
};

export default nextConfig;
