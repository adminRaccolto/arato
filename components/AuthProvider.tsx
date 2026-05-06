"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { calcularStepsCompletos } from "../lib/onboarding";
import { useRouter } from "next/navigation";

type AuthCtx = {
  fazendaId:              string | null;
  contaId:                string | null;
  nomeUsuario:            string | null;
  emailUsuario:           string | null;
  userRole:               string | null;   // 'client' | 'raccotlo' | null
  nomeFazendaSelecionada: string | null;
  onboardingAtivo:        boolean;
  stepsCompletos:         number;
  refetchOnboarding:      () => void;
  selectFazenda:          (id: string, nome: string) => void;
  setFazendaAtiva:        (id: string, nome: string) => Promise<void>;
  clearFazenda:           () => void;
  signOut:                () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  fazendaId:              null,
  contaId:                null,
  nomeUsuario:            null,
  emailUsuario:           null,
  userRole:               null,
  nomeFazendaSelecionada: null,
  onboardingAtivo:        false,
  stepsCompletos:         0,
  refetchOnboarding:      () => {},
  selectFazenda:          () => {},
  setFazendaAtiva:        async () => {},
  clearFazenda:           () => {},
  signOut:                async () => {},
});

export function useAuth() { return useContext(Ctx); }

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [fazendaId,              setFazendaId]              = useState<string | null>(null);
  const [contaId,                setContaId]                = useState<string | null>(null);
  const [nomeUsuario,            setNomeUsuario]            = useState<string | null>(null);
  const [emailUsuario,           setEmailUsuario]           = useState<string | null>(null);
  const [userRole,               setUserRole]               = useState<string | null>(null);
  const [nomeFazendaSelecionada, setNomeFazendaSelecionada] = useState<string | null>(null);
  const [onboardingAtivo,        setOnboardingAtivo]        = useState<boolean>(false);
  const [stepsCompletos,         setStepsCompletos]         = useState<number>(0);
  const router = useRouter();

  const selectFazenda = useCallback((id: string, nome: string) => {
    localStorage.setItem("raccotlo_fazenda_id",   id);
    localStorage.setItem("raccotlo_fazenda_nome", nome);
    setFazendaId(id);
    setNomeFazendaSelecionada(nome);
    router.push("/");
  }, [router]);

  const clearFazenda = useCallback(() => {
    localStorage.removeItem("raccotlo_fazenda_id");
    localStorage.removeItem("raccotlo_fazenda_nome");
    setFazendaId(null);
    setNomeFazendaSelecionada(null);
    router.push("/seletor-cliente");
  }, [router]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (user.user_metadata?.must_change_password) {
        if (typeof window !== "undefined" && window.location.pathname !== "/alterar-senha") {
          router.push("/alterar-senha");
        }
        return;
      }

      setEmailUsuario(user.email ?? null);

      const { data: perfil } = await supabase
        .from("perfis")
        .select("fazenda_id, conta_id, nome, role")
        .eq("user_id", user.id)
        .single();

      const nome = perfil?.nome || user.email || null;
      setNomeUsuario(nome);

      const role = (perfil as { role?: string } | null)?.role ?? "client";
      setUserRole(role);

      if (role === "raccotlo") {
        // Usuário interno — usa fazenda salva no localStorage (persiste entre sessões)
        const savedId   = localStorage.getItem("raccotlo_fazenda_id");
        const savedNome = localStorage.getItem("raccotlo_fazenda_nome");
        if (savedId) {
          setFazendaId(savedId);
          setNomeFazendaSelecionada(savedNome);
        } else if (typeof window !== "undefined" && window.location.pathname !== "/seletor-cliente") {
          router.push("/seletor-cliente");
        }
        return;
      }

      // Usuário cliente normal
      const fid: string | null = (perfil as { fazenda_id?: string } | null)?.fazenda_id ?? null;
      const cid: string | null = (perfil as { conta_id?: string } | null)?.conta_id ?? null;
      setFazendaId(fid);
      setContaId(cid);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setFazendaId(null);
        setContaId(null);
        setNomeUsuario(null);
        setEmailUsuario(null);
        setUserRole(null);
        setNomeFazendaSelecionada(null);
        router.push("/login");
      }
      if (event === "SIGNED_IN") init();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchOnboarding = useCallback(async (fid: string, cid: string) => {
    try {
      const { data: conta } = await supabase
        .from("contas")
        .select("onboarding_ativo")
        .eq("id", cid)
        .maybeSingle();
      const ativo = conta?.onboarding_ativo ?? false;
      setOnboardingAtivo(ativo);
      if (ativo) {
        const completos = await calcularStepsCompletos(fid);
        setStepsCompletos(completos);
      }
    } catch {
      // onboarding_ativo column may not exist yet (migration pending)
    }
  }, []);

  // Re-executa a detecção de steps (chamar após o usuário completar um passo)
  const refetchOnboarding = useCallback(() => {
    if (fazendaId && contaId) fetchOnboarding(fazendaId, contaId).catch(() => {});
  }, [fazendaId, contaId, fetchOnboarding]);

  useEffect(() => {
    if (fazendaId && contaId) fetchOnboarding(fazendaId, contaId).catch(() => {});
  }, [fazendaId, contaId, fetchOnboarding]);

  // Troca de fazenda ativa dentro da mesma conta (farm switcher)
  const setFazendaAtiva = useCallback(async (id: string, nome: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("perfis").update({ fazenda_id: id }).eq("user_id", user.id);
    }
    localStorage.setItem("raccotlo_fazenda_id", id);
    localStorage.setItem("raccotlo_fazenda_nome", nome);
    setFazendaId(id);
    setNomeFazendaSelecionada(nome);
  }, []);

  async function signOut() {
    localStorage.removeItem("raccotlo_fazenda_id");
    localStorage.removeItem("raccotlo_fazenda_nome");
    await supabase.auth.signOut();
  }

  return (
    <Ctx.Provider value={{
      fazendaId, contaId, nomeUsuario, emailUsuario, userRole,
      nomeFazendaSelecionada, onboardingAtivo, stepsCompletos, refetchOnboarding,
      selectFazenda, setFazendaAtiva, clearFazenda, signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}
