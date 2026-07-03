"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ManifestacaoRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/compras/nf?tab=sieg");
  }, [router]);
  return null;
}
