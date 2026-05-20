/**
 * Onboarding: Odir Grendene — Fazenda Nossa Senhora de Fátima
 * Uso: npx tsx scripts/criar-cliente-grendene.ts
 */
// dotenv ANTES do import do supabase (evita hoisting de ESM)
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { criarClienteCompleto } = await import("../lib/criarClienteCompleto");
  console.log("\n🚜 Criando cliente Odir Grendene...\n");

  const result = await criarClienteCompleto({
    tipo:             "pf",
    nome:             "Odir Grendene",
    fazenda_nome:     "Nossa Senhora de Fátima",
    fazenda_municipio: "Nova Mutum",
    fazenda_estado:    "MT",
    fazenda_area:      "1290",
    user_nome:         "Carol",
    user_email:        "grendenecaroline@gmail.com",
    user_senha:        "Arato@2026",
    onboarding_ativo:  true,
  });

  console.log("✅ Cliente criado com sucesso!");
  console.log(`   Fazenda ID : ${result.fazenda_id}`);
  console.log(`   Login      : ${result.user_email}`);
  console.log(`   Senha      : Arato@2026`);
  console.log(`   E-mail     : ${result.email_enviado ? "enviado ✅" : "não enviado (Resend não configurado)"}`);
  console.log(`\n   ➡ Use este FAZENDA_ID para importar a Plantae:`);
  console.log(`   FAZENDA_ID=${result.fazenda_id} npx tsx scripts/import-plantae.ts`);
}

main().catch(err => { console.error("❌ ERRO:", String(err)); process.exit(1); });
