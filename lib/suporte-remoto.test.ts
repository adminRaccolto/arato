import assert from "node:assert/strict";
import test from "node:test";
import { configuracaoParaImportar, detectarSistema, NOME_EXE_CONFIGURADO, CHAVE_SUPORTE } from "./suporte-remoto.ts";

test("configuração exportada decodifica como o RustDesk (inverte e lê base64)", () => {
  const s = configuracaoParaImportar();
  const json = JSON.parse(Buffer.from(s.split("").reverse().join(""), "base64url").toString());
  assert.deepEqual(json, { host: "suporte.arato.agr.br", relay: "suporte.arato.agr.br", api: "", key: CHAVE_SUPORTE });
});
test("nome do executável segue o formato lido pelo RustDesk e termina com vírgula", () => {
  assert.equal(NOME_EXE_CONFIGURADO, `rustdesk-host=suporte.arato.agr.br,key=${CHAVE_SUPORTE},.exe`);
});
test("detecta o sistema do cliente", () => {
  assert.equal(detectarSistema("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
  assert.equal(detectarSistema("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "mac");
  assert.equal(detectarSistema("Mozilla/5.0 (Linux; Android 14)"), "outro");
  assert.equal(detectarSistema("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "outro");
});
