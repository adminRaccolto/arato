// Ajustes no layout do DANFE da biblioteca nfe-danfe-pdf (roda no postinstall, inclusive na Vercel). Idempotente: se o
// arquivo mudar numa versão nova da biblioteca, avisa e não altera nada.
//  1. IE do emitente alinhada à direita do quadro — à esquerda ela ficava em cima do título "DESTINATÁRIO / REMETENTE".
//  2. Emitente pessoa física (produtor): o campo "CNPJ" saía vazio; passa a "CNPJ / CPF" com o CPF.
import fs from "fs";

const arq = new URL("../node_modules/nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/get-dados-emitente.js", import.meta.url);
if (!fs.existsSync(arq)) process.exit(0);
let s = fs.readFileSync(arq, "utf8");
if (s.includes("/* arato-patch */")) process.exit(0);

const trocas = [
  [`        value: (0, utils_1.formatStateRegistration)(emit.IE, emit.enderEmit.UF),
        x: 1.5,
        y: y + 134.1,
        largura: 192.5,`,
   `        value: (0, utils_1.formatStateRegistration)(emit.IE, emit.enderEmit.UF),
        x: 1.5,
        y: y + 134.1,
        largura: 188,
        alinhamento: 'right', /* arato-patch */`],
  [`(0, titulo_1.titulo)({ value: 'CNPJ', x: 392.5,`, `(0, titulo_1.titulo)({ value: 'CNPJ / CPF', x: 392.5,`],
  [`value: (0, utils_1.formatCnpj)(emit.CNPJ ?? ''),`, `value: emit.CNPJ ? (0, utils_1.formatCnpj)(emit.CNPJ) : (0, utils_1.formatCpf)(emit.CPF ?? ''),`],
];
for (const [de] of trocas) {
  if (!s.includes(de)) { console.warn("[patch-nfe-danfe] layout da biblioteca mudou — ajuste do DANFE não aplicado"); process.exit(0); }
}
for (const [de, para] of trocas) s = s.replace(de, para);
fs.writeFileSync(arq, s);
console.log("[patch-nfe-danfe] DANFE ajustado (IE do emitente à direita; CPF do emitente)");
