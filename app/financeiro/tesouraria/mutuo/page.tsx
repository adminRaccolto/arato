// A tela dedicada de mútuo saiu (31/10/2026): o mútuo é lançado na Tesouraria → "Lançamento de Mútuo", com quem
// empresta, quem recebe e a devolução ligada ao mútuo. Endereço antigo leva para lá.
import { redirect } from "next/navigation";

export default function MutuoPage() {
  redirect("/financeiro/tesouraria");
}
