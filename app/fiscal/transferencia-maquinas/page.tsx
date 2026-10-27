// A Transferência de Máquinas virou a aba "Máquinas e equipamentos" da tela Remessas (diretriz 27/10/2026: um caminho
// só para remessa e retorno). Mantém o endereço antigo funcionando.
import { redirect } from "next/navigation";

export default function TransferenciaMaquinasPage() {
  redirect("/fiscal/remessas?aba=maquinas");
}
