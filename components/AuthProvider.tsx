"use client";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";

type AuthCtx = {
  fazendaId:              string | null;
  nomeUsuario:            string | null;
  emailUsuario:           string | null;
  userRole:               string | null;   // 'client' | 'raccotlo' | null
  nomeFazendaSelecionada: string | null;
  selectFazenda:          (id: string, nome: string) => void;
  clearFazenda:           () => void;
  signOut:                () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  fazendaId:              null,
  nomeUsuario:            null,
  emailUsuario:           null,
  userRole:               null,
  nomeFazendaSelecionada: null,
  selectFazenda:          () => {},
  clearFazenda:           () => {},
  signOut:                async () => {},
});

export function useAuth() { return useContext(Ctx); }

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [fazendaId,              setFazendaId]              = useState<string | null>(null);
  const [nomeUsuario,            setNomeUsuario]            = useState<string | null>(null);
  const [emailUsuario,           setEmailUsuario]           = useState<string | null>(null);
  const [userRole,               setUserRole]               = useState<string | null>(null);
  const [nomeFazendaSelecionada, setNomeFazendaSelecionada] = useState<string | null>(null);
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
        .select("fazenda_id, nome")
        .eq("user_id", user.id)
        .single();

      const nome = perfil?.nome || user.email || null;
      setNomeUsuario(nome);

      // Busca role
      let role = "client";
      try {
        const { data: rolData } = await supabase
          .from("perfis").select("role").eq("user_id", user.id).single();
        role = (rolData as { role?: string } | null)?.role ?? "client";
      } catch { /* mantém 'client' */ }
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
      let fid: string | null = perfil?.fazenda_id ?? null;

      if (!fid) {
        const { data: fazendas } = await supabase
          .from("fazendas")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1);
        if (fazendas && fazendas.length > 0) {
          fid = fazendas[0].id;
          await supabase.from("perfis").upsert(
            { user_id: user.id, fazenda_id: fid, nome: nome ?? user.email },
            { onConflict: "user_id" }
          );
        }
      }

      setFazendaId(fid);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Mantém a seleção de fazenda no localStorage — só é limpa pelo signOut() explícito
        setFazendaId(null);
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

  async function signOut() {
    localStorage.removeItem("raccotlo_fazenda_id");
    localStorage.removeItem("raccotlo_fazenda_nome");
    await supabase.auth.signOut();
  }

  return (
    <Ctx.Provider value={{
      fazendaId, nomeUsuario, emailUsuario, userRole,
      nomeFazendaSelecionada, selectFazenda, clearFazenda, signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}
