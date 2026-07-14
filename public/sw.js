const CACHE = "arato-campo-v1";

// Páginas do app campo que serão pré-cacheadas
const APP_SHELL = [
  "/campo",
  "/campo/plantio",
  "/campo/pulverizacao",
  "/campo/colheita",
  "/campo/abastecimento",
  "/campo/monitoramento",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
];

// Instala: cacheia app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        // Falha silenciosa — páginas ainda não existem no build inicial
      })
    )
  );
  self.skipWaiting();
});

// Ativa: remove caches antigos
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

  // Só intercepta GET
  if (request.method !== "GET") return;

  // Supabase e APIs externas: rede primeiro, sem cache
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/api/")
  ) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({ error: "offline", data: null }),
            { headers: { "Content-Type": "application/json" } }
          )
      )
    );
    return;
  }

  // Assets estáticos Next.js (_next/static): cache first — nunca mudam (hashed)
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

  // Páginas /campo/*: stale-while-revalidate
  if (url.pathname === "/campo" || url.pathname.startsWith("/campo/")) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached || new Response("Sem conexão", { status: 503 }));
          // Retorna cache imediatamente e atualiza em background
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Outros recursos: rede com fallback cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
