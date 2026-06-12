/**
 * RacTech — Bridge Toledo PRIX
 * Conecta na balança via TCP (192.168.0.50:9000) e expõe WebSocket local (ws://localhost:8765)
 *
 * A Toledo PRIX fecha a conexão após cada leitura — usamos modo polling:
 * conecta → lê → desconecta → aguarda 1s → repete.
 */

const net  = require("net");
const http = require("http");
const { WebSocketServer } = require("ws");

const TOLEDO_HOST    = "192.168.0.50";
const TOLEDO_PORT    = 9000;
const WS_PORT        = 8765;
const POLL_INTERVALO = 1000;   // ms entre cada leitura
const TIMEOUT_TCP    = 3000;   // ms para desistir se Toledo não responder

// ── Parser Toledo PRIX ──────────────────────────────────────────
function parseToledo(linha) {
  const limpa = linha.replace(/[\x00-\x1F\x7F]/g, " ").trim();
  if (!limpa) return null;

  const m1 = limpa.match(/[+-]?\d+[\.,]?\d*\s*kg/i);
  if (m1) {
    const v = parseFloat(m1[0].replace(/kg/i, "").replace(",", ".").trim());
    return isFinite(v) && v > 0 ? v : null;
  }
  const m2 = limpa.match(/^P\s+0*(\d+)/i);
  if (m2) { const v = parseInt(m2[1], 10); return v > 0 ? v : null; }

  const m3 = limpa.match(/^[+-]?\s*0*(\d{3,7}[\.,]?\d*)\s*$/);
  if (m3) { const v = parseFloat(m3[1].replace(",", ".")); return isFinite(v) && v >= 100 ? v : null; }

  return null;
}

// ── WebSocket server ────────────────────────────────────────────
const server = http.createServer();
const wss    = new WebSocketServer({ server });
let wsClients = new Set();

wss.on("connection", ws => {
  wsClients.add(ws);
  console.log(`[WS] Chrome conectado. Total: ${wsClients.size}`);
  ws.send(JSON.stringify({ tipo: "status", msg: "Bridge ativo — aguardando leitura" }));
  ws.on("close", () => { wsClients.delete(ws); });
});

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of wsClients) {
    try { ws.send(msg); } catch { /* ignora */ }
  }
}

server.listen(WS_PORT, "127.0.0.1", () => {
  console.log(`[WS]  Chrome em ws://localhost:${WS_PORT}`);
});

// ── Polling Toledo ──────────────────────────────────────────────
// Faz uma leitura por ciclo: abre conexão, lê primeira linha com peso, fecha.
function lerUmaVez() {
  return new Promise(resolve => {
    const tcp    = new net.Socket();
    let   buffer = "";
    let   resolveu = false;

    const finalizar = (peso) => {
      if (resolveu) return;
      resolveu = true;
      tcp.destroy();
      resolve(peso);
    };

    const timer = setTimeout(() => finalizar(null), TIMEOUT_TCP);

    tcp.connect(TOLEDO_PORT, TOLEDO_HOST, () => {
      // Toledo PRIX requer comando de solicitação — tenta ENQ (0x05) seguido de "P\r\n"
      tcp.write(Buffer.from([0x05]));
      setTimeout(() => { if (!resolveu) tcp.write(Buffer.from("P\r\n")); }, 200);
    });

    tcp.on("data", data => {
      // Log raw para diagnóstico (hex + texto)
      const hex  = data.toString("hex").match(/.{1,2}/g).join(" ");
      const txt  = data.toString().replace(/[\x00-\x1F\x7F]/g, "·");
      console.log(`[RAW] hex: ${hex}`);
      console.log(`[RAW] txt: "${txt}"`);

      buffer += data.toString();
      const linhas = buffer.split(/\r?\n/);
      buffer = linhas.pop() ?? "";
      for (const linha of linhas) {
        const peso = parseToledo(linha);
        if (peso !== null) {
          clearTimeout(timer);
          finalizar(peso);
          return;
        }
      }
    });

    tcp.on("error", () => { clearTimeout(timer); finalizar(null); });
    tcp.on("close", () => { clearTimeout(timer); finalizar(null); });
  });
}

async function loopPolling() {
  let ultimoPeso = null;
  let errosConsecutivos = 0;

  while (true) {
    const peso = await lerUmaVez();

    if (peso !== null) {
      errosConsecutivos = 0;
      if (peso !== ultimoPeso) {
        ultimoPeso = peso;
        console.log(`[PESO] ${peso} kg`);
        broadcast({ tipo: "peso", kg: peso });
      }
    } else {
      errosConsecutivos++;
      if (errosConsecutivos === 1) {
        console.warn(`[TCP] Toledo não respondeu — tentando novamente…`);
        broadcast({ tipo: "status", msg: "Aguardando resposta da balança…" });
      }
      if (errosConsecutivos >= 5) {
        console.error(`[TCP] Toledo offline (${TOLEDO_HOST}:${TOLEDO_PORT})`);
        broadcast({ tipo: "status", msg: `Balança offline (${TOLEDO_HOST}:${TOLEDO_PORT})` });
        errosConsecutivos = 0;
        await esperar(5000); // pausa maior quando Toledo está offline
        continue;
      }
    }

    await esperar(POLL_INTERVALO);
  }
}

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

loopPolling();

console.log("──────────────────────────────────────────");
console.log("  RacTech Bridge — Toledo PRIX");
console.log(`  Balança : ${TOLEDO_HOST}:${TOLEDO_PORT}`);
console.log(`  Chrome  : ws://localhost:${WS_PORT}`);
console.log("  Minimize esta janela. Não feche.");
console.log("──────────────────────────────────────────");
