/**
 * RacTech — Bridge Toledo PRIX
 * Conecta na balança via TCP (192.168.0.50:9000) e expõe WebSocket local (ws://localhost:8765)
 * para o sistema RacTech no Chrome.
 *
 * Uso: node bridge.js
 */

const net = require("net");
const http = require("http");
const { WebSocketServer } = require("ws");

const TOLEDO_HOST = "192.168.0.50";
const TOLEDO_PORT = 9000;
const WS_PORT     = 8765;

// ── Parser Toledo PRIX ──────────────────────────────────────────
function parseToledo(linha) {
  const limpa = linha.replace(/[\x00-\x1F\x7F]/g, " ").trim();
  if (!limpa) return null;

  // "ST,GS,  +0012345 kg"
  const m1 = limpa.match(/[+-]?\d+[\.,]?\d*\s*kg/i);
  if (m1) {
    const v = parseFloat(m1[0].replace(/kg/i, "").replace(",", ".").trim());
    return isFinite(v) && v > 0 ? v : null;
  }
  // "P  0012345"
  const m2 = limpa.match(/^P\s+0*(\d+)/i);
  if (m2) { const v = parseInt(m2[1], 10); return v > 0 ? v : null; }
  // número isolado >= 100
  const m3 = limpa.match(/^[+-]?\s*0*(\d{3,7}[\.,]?\d*)\s*$/);
  if (m3) {
    const v = parseFloat(m3[1].replace(",", "."));
    return isFinite(v) && v >= 100 ? v : null;
  }
  return null;
}

// ── WebSocket server (para o Chrome) ───────────────────────────
const server = http.createServer();
const wss    = new WebSocketServer({ server });

let wsClients = new Set();
wss.on("connection", ws => {
  wsClients.add(ws);
  console.log(`[WS] Cliente conectado. Total: ${wsClients.size}`);
  ws.send(JSON.stringify({ tipo: "status", msg: "Conectado ao bridge RacTech" }));
  ws.on("close", () => { wsClients.delete(ws); console.log("[WS] Cliente desconectado."); });
});

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of wsClients) {
    try { ws.send(msg); } catch { /* ignora */ }
  }
}

server.listen(WS_PORT, "127.0.0.1", () => {
  console.log(`[WS]  Aguardando Chrome em ws://localhost:${WS_PORT}`);
});

// ── Conexão TCP com a Toledo ────────────────────────────────────
let buffer        = "";
let reconectando  = false;

function conectarToledo() {
  if (reconectando) return;
  reconectando = true;

  const tcp = new net.Socket();

  tcp.connect(TOLEDO_PORT, TOLEDO_HOST, () => {
    reconectando = false;
    console.log(`[TCP] Conectado à Toledo ${TOLEDO_HOST}:${TOLEDO_PORT}`);
    broadcast({ tipo: "status", msg: "Balança conectada" });
  });

  tcp.on("data", data => {
    buffer += data.toString();
    const linhas = buffer.split(/\r?\n/);
    buffer = linhas.pop() ?? "";
    for (const linha of linhas) {
      const peso = parseToledo(linha);
      if (peso !== null) {
        console.log(`[PESO] ${peso} kg`);
        broadcast({ tipo: "peso", kg: peso });
      }
    }
  });

  tcp.on("error", err => {
    console.error(`[TCP] Erro: ${err.message} — reconectando em 3s…`);
    broadcast({ tipo: "status", msg: "Balança desconectada — reconectando…" });
    tcp.destroy();
    setTimeout(() => { reconectando = false; conectarToledo(); }, 3000);
  });

  tcp.on("close", () => {
    console.log("[TCP] Conexão encerrada — reconectando em 3s…");
    broadcast({ tipo: "status", msg: "Balança desconectada — reconectando…" });
    setTimeout(() => { reconectando = false; conectarToledo(); }, 3000);
  });
}

conectarToledo();

console.log("──────────────────────────────────────────");
console.log("  RacTech Bridge — Toledo PRIX");
console.log(`  Balança : ${TOLEDO_HOST}:${TOLEDO_PORT}`);
console.log(`  Chrome  : ws://localhost:${WS_PORT}`);
console.log("  Minimize esta janela. Não feche.");
console.log("──────────────────────────────────────────");
