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
// Formato real confirmado: 02 31 70 60 [11 dígitos ASCII] 0d b0
// Bytes:  STX  '1'  'p'  '`'  "00000000000"  CR  checksum
// Os 11 dígitos = peso em gramas (últimos 3 = decimal → divide por 1000 = kg)
// Exemplo: "00043800000" → 43800000 / 1000 = 43800.000 kg
function parseToledo(buf) {
  // Aceita Buffer ou string
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "binary");

  // Procura o padrão: STX (02) + 3 bytes cabeçalho + dígitos ASCII + CR (0d)
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0x02) continue;
    // Pula STX + 3 bytes de header = posição i+4
    const digitStart = i + 4;
    if (digitStart >= bytes.length) continue;

    let digits = "";
    for (let j = digitStart; j < bytes.length; j++) {
      const c = bytes[j];
      if (c >= 0x30 && c <= 0x39) {          // '0'–'9'
        digits += String.fromCharCode(c);
      } else if (c === 0x0d || c === 0x0a) { // CR ou LF — fim do campo
        break;
      } else {
        digits = ""; break;                  // byte inesperado — descarta
      }
    }

    if (digits.length >= 6) {
      const raw = parseInt(digits, 10);
      // 3 casas decimais implícitas → kg
      const kg = raw / 1000;
      if (isFinite(kg) && kg >= 0) return kg;
    }
  }
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
      const hex = data.toString("hex").match(/.{1,2}/g).join(" ");
      const txt = data.toString().replace(/[\x00-\x1F\x7F]/g, "·");
      console.log(`[RAW] hex: ${hex}`);
      console.log(`[RAW] txt: "${txt}"`);

      // Parser binário — não usa split por linha pois o protocolo é binário
      const peso = parseToledo(data);
      if (peso !== null) {
        clearTimeout(timer);
        finalizar(peso);
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
