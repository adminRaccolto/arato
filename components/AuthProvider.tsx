"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { calcularStepsCompletos } from "../lib/onboarding";
import { planoInclui } from "../lib/planos";
import type { PlanoId } from "../lib/planos";
import { useRouter } from "next/navigation";

const INACTIVITY_MS  = 30 * 60 * 1000; // 30 minutos
const LAST_ACTIVE_KEY = "ractech_last_active";

// Permissões por módulo — values: 'escrita' | 'leitura' | 'nenhum'
// Vazio = sem restrição (raccotlo ou usuário sem grupo)
export type ModuloPermissao = "escrita" | "leitura" | "nenhum";

type AuthCtx = {
  fazendaId:              string | null;
  contaId:                string | null;
  nomeUsuario:            string | null;
  emailUsuario:           string | null;
  userRole:               string | null;   // 'client' | 'raccotlo' | null
  raccotloGestor:         boolean;         // true = gestor (admin+clientes); false = operacional (só clientes)
  nomeFazendaSelecionada: string | null;
  nomeProdutor:           string | null;   // nome do produtor/agricultor (exibido no topo)
  logoCliente:            string | null;   // logo da conta (por cliente SaaS)
  onboardingAtivo:        boolean;
  stepsCompletos:         number;
  // Plano SaaS
  planoAtual:             PlanoId | null;
  contaStatus:            string | null;   // 'trial' | 'ativo' | 'inadimplente' | 'inativo' | 'cancelado'
  inadimplente:           boolean;
  // Permissões por módulo do grupo do usuário
  permissoes:             Record<string, ModuloPermissao>;
  // Helpers
  podeAcessar:            (modulo: string) => boolean;  // false quando 'nenhum'
  podeEscrever:           (modulo: string) => boolean;  // true quando 'escrita'
  podeAcessarPlano:       (modulo: string) => boolean;  // false se módulo não está no plano
  refetchOnboarding:      () => void;
  selectFazenda:          (id: string, fazendaNome: string, produtorNome?: string | null) => void;
  setFazendaAtiva:        (id: string, nome: string) => Promise<void>;
  setLogoCliente:         (url: string | null) => void;
  clearFazenda:           () => void;
  signOut:                () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  fazendaId:              null,
  contaId:                null,
  nomeUsuario:            null,
  emailUsuario:           null,
  userRole:               null,
  raccotloGestor:         true,
  nomeFazendaSelecionada: null,
  nomeProdutor:           null,
  logoCliente:            null,
  onboardingAtivo:        false,
  stepsCompletos:         0,
  planoAtual:             null,
  contaStatus:            null,
  inadimplente:           false,
  permissoes:             {},
  podeAcessar:            () => true,
  podeEscrever:           () => true,
  podeAcessarPlano:       () => true,
  refetchOnboarding:      () => {},
  selectFazenda:          () => {},
  setFazendaAtiva:        async () => {},
  setLogoCliente:         () => {},
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
  const [raccotloGestor,         setRaccotloGestor]         = useState<boolean>(true);
  const [nomeFazendaSelecionada, setNomeFazendaSelecionada] = useState<string | null>(null);
  const [nomeProdutor,           setNomeProdutor]           = useState<string | null>(null);
  const [onboardingAtivo,        setOnboardingAtivo]        = useState<boolean>(false);
  const [stepsCompletos,         setStepsCompletos]         = useState<number>(0);
  const [permissoes,             setPermissoes]             = useState<Record<string, ModuloPermissao>>({});
  const [logoCliente,            setLogoCliente]            = useState<string | null>(null);
  const [planoAtual,             setPlanoAtual]             = useState<PlanoId | null>(null);
  const [contaStatus,            setContaStatus]            = useState<string | null>(null);
  const router = useRouter();
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectFazenda = useCallback((id: string, fazendaNome: string, produtorNome?: string | null) => {
    localStorage.setItem("raccotlo_fazenda_id",       id);
    localStorage.setItem("raccotlo_fazenda_nome",     fazendaNome);
    if (produtorNome) localStorage.setItem("raccotlo_produtor_nome", produtorNome);
    else              localStorage.removeItem("raccotlo_produtor_nome");
    setFazendaId(id);
    setNomeFazendaSelecionada(fazendaNome);
    setNomeProdutor(produtorNome ?? null);
    // Sincroniza logo e contaId com o que acessarCliente() escreveu no localStorage
    // O AuthProvider não remonta entre navegações no App Router, então é necessário atualizar explicitamente
    const logoUrl         = localStorage.getItem("raccotlo_cliente_logo");
    const clienteContaId  = localStorage.getItem("raccotlo_cliente_conta_id");
    setLogoCliente(logoUrl ?? null);
    setContaId(clienteContaId && !clienteContaId.startsWith("sem_conta_") ? clienteContaId : null);
    router.push("/");
  }, [router]);

  const clearFazenda = useCallback(() => {
    localStorage.removeItem("raccotlo_fazenda_id");
    localStorage.removeItem("raccotlo_fazenda_nome");
    localStorage.removeItem("raccotlo_produtor_nome");
    localStorage.removeItem("raccotlo_cliente_logo");
    localStorage.removeItem("raccotlo_cliente_conta_id");
    setFazendaId(null);
    setContaId(null);
    setNomeFazendaSelecionada(null);
    setNomeProdutor(null);
    setLogoCliente(null);
    router.push("/seletor-cliente");
  }, [router]);

  useEffect(() => {
    async function init() {
      // Se o usuário ficou ausente por mais de 30 min (aba fechada / navegador fechado),
      // encerra a sessão ao retornar — cobre o caso "fechamento de navegador"
      const lastActiveStr = localStorage.getItem(LAST_ACTIVE_KEY);
      if (lastActiveStr) {
        const elapsed = Date.now() - parseInt(lastActiveStr, 10);
        if (elapsed > INACTIVITY_MS) {
          localStorage.removeItem(LAST_ACTIVE_KEY);
          localStorage.removeItem("raccotlo_fazenda_id");
          localStorage.removeItem("raccotlo_fazenda_nome");
          await supabase.auth.signOut(); // dispara SIGNED_OUT → redirect /login
          return;
        }
      }
      // Registra atividade ao iniciar a sessão
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());

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
        .maybeSingle();

      const nome = perfil?.nome || user.email || null;
      setNomeUsuario(nome);

      const isRaccoltoEmail = (user.email ?? "").toLowerCase().endsWith("@raccolto.com.br");
      const dbRole = (perfil as { role?: string } | null)?.role ?? "client";
      const role = isRaccoltoEmail ? "raccotlo" : dbRole;
      setUserRole(role);

      // Garante que o banco reflete o role correto para @raccolto.com.br
      // Preserva raccotlo_operacional intencionalmente — não sobrescreve
      if (isRaccoltoEmail && dbRole !== "raccotlo" && dbRole !== "raccotlo_operacional") {
        supabase.from("perfis").update({ role: "raccotlo" }).eq("user_id", user.id).then(() => {});
      }

      if (role === "raccotlo") {
        // Todos os usuários raccotlo têm acesso total (gestor)
        // raccotlo_operacional existe como sub-role futuro mas não restringe nada por ora
        setRaccotloGestor(true);

        // Usuário interno — usa fazenda salva no localStorage (persiste entre sessões)
        const savedId           = localStorage.getItem("raccotlo_fazenda_id");
        const savedNome         = localStorage.getItem("raccotlo_fazenda_nome");
        const savedProdutorNome = localStorage.getItem("raccotlo_produtor_nome");
        const savedLogoUrl      = localStorage.getItem("raccotlo_cliente_logo");
        const savedClienteContaId = localStorage.getItem("raccotlo_cliente_conta_id");
        if (savedId) {
          setFazendaId(savedId);
          setNomeFazendaSelecionada(savedNome);
          setNomeProdutor(savedProdutorNome);
          if (savedLogoUrl)       setLogoCliente(savedLogoUrl);
          // Ignora IDs sintéticos "sem_conta_<fazenda_id>" — deixa contaId=null nesses casos
          if (savedClienteContaId && !savedClienteContaId.startsWith("sem_conta_")) setContaId(savedClienteContaId);
        } else {
          // Sem farm: hub (/raccotlo), seletor e admin são rotas livres
          const pathname = typeof window !== "undefined" ? window.location.pathname : "";
          const rotasLivres = ["/raccotlo", "/seletor-cliente", "/admin"];
          if (!rotasLivres.some(r => pathname.startsWith(r))) {
            router.push("/raccotlo");
          }
        }
        // raccotlo não tem restrições de módulo
        setPermissoes({});
        return;
      }

      // Usuário cliente normal
      const fid: string | null = (perfil as { fazenda_id?: string } | null)?.fazenda_id ?? null;
      const cid: string | null = (perfil as { conta_id?: string } | null)?.conta_id ?? null;
      setFazendaId(fid);
      setContaId(cid);

      // Carrega conta + usuário em paralelo (evita 2 round-trips sequenciais)
      const [contaRes, usuarioRes] = await Promise.allSettled([
        cid
          ? supabase.from("contas")
              .select("pacote, status, onboarding_ativo, logo_url")
              .eq("id", cid)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("usuarios")
          .select("grupo_id, grupos_usuarios(permissoes)")
          .eq("auth_user_id", user.id)
          .maybeSingle(),
      ]);

      // Processa conta
      if (contaRes.status === "fulfilled") {
        const conta = contaRes.value.data as Record<string, unknown> | null;
        if (conta) {
          setPlanoAtual((conta.pacote as PlanoId) ?? null);
          setContaStatus((conta.status as string) ?? null);
          const ativo = (conta.onboarding_ativo as boolean) ?? false;
          setOnboardingAtivo(ativo);
          if (conta.logo_url) setLogoCliente(conta.logo_url as string);
          // Calcula steps só se onboarding ativo (evita 7 queries desnecessárias)
          if (ativo && fid) {
            calcularStepsCompletos(fid).then(setStepsCompletos).catch(() => {});
          }
        }
      }

      // Processa permissões
      if (usuarioRes.status === "fulfilled") {
        try {
          const usuarioData = usuarioRes.value.data;
          const perms = (
            (Array.isArray(usuarioData?.grupos_usuarios)
              ? usuarioData?.grupos_usuarios[0]
              : usuarioData?.grupos_usuarios) as { permissoes?: Record<string, string> } | null
          )?.permissoes ?? {};
          setPermissoes(perms as Record<string, ModuloPermissao>);
        } catch {
          setPermissoes({});
        }
      } else {
        setPermissoes({});
      }
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

  // Re-executa só os steps (chamar após o usuário completar um passo do onboarding)
  const refetchOnboarding = useCallback(() => {
    if (fazendaId && onboardingAtivo) {
      calcularStepsCompletos(fazendaId).then(setStepsCompletos).catch(() => {});
    }
  }, [fazendaId, onboardingAtivo]);

  // Rastreamento de inatividade — ativo somente quando há sessão autenticada
  useEffect(() => {
    if (!fazendaId && !userRole) return; // ainda não autenticado

    const doSignOut = async () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      localStorage.removeItem(LAST_ACTIVE_KEY);
      localStorage.removeItem("raccotlo_fazenda_id");
      localStorage.removeItem("raccotlo_fazenda_nome");
      await supabase.auth.signOut();
    };

    const resetTimer = () => {
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(doSignOut, INACTIVITY_MS);
    };

    // Ao voltar para a aba após ausência, verifica se o tempo expirou
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const last = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) ?? "0", 10);
      if (last && Date.now() - last > INACTIVITY_MS) {
        doSignOut().catch(() => {});
      } else {
        resetTimer();
      }
    };

    const events = ["mousemove", "keydown", "scroll", "click", "touchstart"] as const;
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);
    resetTimer(); // inicia o contador

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      events.forEach(e => window.removeEventListener(e, resetTimer));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fazendaId, userRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const podeAcessar = useCallback((modulo: string) => {
    // Módulos exclusivos da Raccolto — bloqueados para todos os usuários clientes
    if (modulo === "conf_raccotlo" && userRole !== "raccotlo") return false;
    const p = permissoes[modulo] as unknown;
    if (p === undefined) return true;                            // sem restrição configurada
    if (Array.isArray(p)) return (p as string[]).includes("visualizar"); // novo formato
    return (p as string) !== "nenhum";                         // formato legado
  }, [permissoes, userRole]);

  const podeEscrever = useCallback((modulo: string) => {
    const p = permissoes[modulo] as unknown;
    if (p === undefined) return true;
    if (Array.isArray(p)) return (p as string[]).includes("criar") || (p as string[]).includes("editar");
    return (p as string) === "escrita";
  }, [permissoes]);

  // raccotlo tem acesso irrestrito a tudo; clientes verificam o plano
  const podeAcessarPlano = useCallback((modulo: string) => {
    if (userRole === "raccotlo") return true;
    if (!planoAtual) return true; // sem plano carregado ainda → não bloqueia
    return planoInclui(planoAtual, modulo);
  }, [planoAtual, userRole]);

  // Troca de fazenda ativa dentro da mesma conta (farm switcher)
  const setFazendaAtiva = useCallback(async (id: string, nome: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      // Usa API route com service_role_key para garantir UPDATE mesmo com JWT próximo do vencimento
      fetch("/api/perfil/fazenda-ativa", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fazenda_id: id }),
      }).catch(() => {}); // fire-and-forget — localStorage já atualiza a UI imediatamente
    }
    localStorage.setItem("raccotlo_fazenda_id", id);
    localStorage.setItem("raccotlo_fazenda_nome", nome);
    setFazendaId(id);
    setNomeFazendaSelecionada(nome);
  }, []);

  async function signOut() {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    localStorage.removeItem(LAST_ACTIVE_KEY);
    localStorage.removeItem("raccotlo_fazenda_id");
    localStorage.removeItem("raccotlo_fazenda_nome");
    localStorage.removeItem("raccotlo_produtor_nome");
    await supabase.auth.signOut();
  }

  const inadimplente = contaStatus === "inadimplente";

  return (
    <Ctx.Provider value={{
      fazendaId, contaId, nomeUsuario, emailUsuario, userRole, raccotloGestor,
      nomeFazendaSelecionada, nomeProdutor, logoCliente, setLogoCliente,
      onboardingAtivo, stepsCompletos, refetchOnboarding,
      planoAtual, contaStatus, inadimplente,
      permissoes, podeAcessar, podeEscrever, podeAcessarPlano,
      selectFazenda, setFazendaAtiva, clearFazenda, signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}
