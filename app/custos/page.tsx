"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PlanoGate from "../../components/PlanoGate";
import RelatorioResultados from "../../components/RelatorioResultados";
import type { ModoResultado } from "../../components/resultados/TabelaResultados";
function Custos() {
  const aba = useSearchParams().get("aba");
  const modo: ModoResultado =
    aba === "custoha" || aba === "custostotais" || aba === "produtividade"
      ? aba
      : "dre";
  return (
    <PlanoGate modulo="custos">
      <RelatorioResultados modo={modo} />
    </PlanoGate>
  );
}
export default function CustosPage() {
  return (
    <Suspense fallback={<p>Carregando resultados…</p>}>
      <Custos />
    </Suspense>
  );
}
