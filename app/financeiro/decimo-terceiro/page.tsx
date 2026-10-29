import { redirect } from "next/navigation";

// O 13º Salário virou aba da Folha de Pagamento (29/10/2026) — endereço antigo leva para lá.
export default function DecimoTerceiroRedirect() {
  redirect("/financeiro/folha?aba=decimo");
}
