const CACHE = "arato-v3";

const APP_SHELL = [
  "/",
  "/login",
  "/campo",
  "/campo/plantio",
  "/campo/pulverizacao",
  "/campo/aerea",
  "/campo/colheita",
  "/campo/abastecimento",
  "/campo/monitoramento",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.hostname.includes("supabase.co") || url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () => new Response(JSON.stringify({ error: "offline", data: null }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE).then((c) => c.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arato</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1A4870;color:#fff}.b{text-align:center;padding:32px}.i{font-size:64px;margin-bottom:16px}.t{font-size:22px;font-weight:700;margin-bottom:8px}.s{font-size:14px;opacity:.8;margin-bottom:24px}.btn{background:#C9921B;color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}</style></head><body><div class="b"><div class="i">🌾</div><div class="t">Você está offline</div><div class="s">Verifique sua conexão e tente novamente.</div><button class="btn" onclick="location.reload()">Tentar novamente</button></div></body></html>',
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
        )
      )
  );
});
