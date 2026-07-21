"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FaturasFornecedorRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/financeiro/pagar?aba=faturas"); }, [router]);
  return null;
}
