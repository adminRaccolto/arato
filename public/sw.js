// Service Worker — Arato PWA
// Estratégia:
//   /_next/static/*  → Cache First (assets imutáveis por hash de build)
//   navegação HTML   → Network First, fallback cache, fallback /offline
//   /api/, supabase  → Network Only (dados sempre frescos)
//   imagens/fontes   → Stale-While-Revalidate

const V = "arato-v5";
const STATIC = "arato-static-v5";
const SHELL  = "arato-shell-v5";
const IMAGES = "arato-img-v5";

const OFFLINE_URL = "/offline";

// ── Install: pré-carrega a página offline ──────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.add(OFFLINE_URL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpa caches antigos ────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const keep = new Set([V, STATIC, SHELL, IMAGES]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora não-GET e chrome-extension
  if (request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;

  // 1. API interna + Supabase → Network Only com fallback JSON vazio
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co")
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "offline", data: null }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // 2. Next.js static assets → Cache First (imutáveis por hash)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(request).then((hit) => {
          if (hit) return hit;
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // 3. Next.js image optimization → Stale-While-Revalidate
  if (url.pathname.startsWith("/_next/image")) {
    event.respondWith(
      caches.open(IMAGES).then((cache) =>
        cache.match(request).then((hit) => {
          const net = fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
          return hit ?? net;
        })
      )
    );
    return;
  }

  // 4. Assets estáticos (imagens, fontes, ícones) → Stale-While-Revalidate
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGES).then((cache) =>
        cache.match(request).then((hit) => {
          const net = fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          }).catch(() => hit);
          return hit ?? net;
        })
      )
    );
    return;
  }

  // 5. Navegação HTML → Network First, salva no cache, fallback offline
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        fetch(request)
          .then((res) => {
            // Só cacheia respostas OK (200) para evitar cachear erros
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() =>
            // Offline: tenta a rota específica, cai para /offline
            cache.match(request).then((cached) =>
              cached ?? cache.match(OFFLINE_URL)
            )
          )
      )
    );
    return;
  }
});

// ── Mensagem para forçar atualização do SW ─────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
