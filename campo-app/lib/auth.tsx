import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Fazenda = { id: string; nome: string };

type AuthCtx = {
  session: Session | null;
  user: User | null;
  fazendaId: string | null;
  nomeFazenda: string | null;
  fazendas: Fazenda[];
  emailUsuario: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setFazendaAtiva: (id: string, nome: string) => void;
};

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]       = useState<Session | null>(null);
  const [user, setUser]             = useState<User | null>(null);
  const [fazendaId, setFazendaId]   = useState<string | null>(null);
  const [nomeFazenda, setNomeFazenda] = useState<string | null>(null);
  const [fazendas, setFazendas]     = useState<Fazenda[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) carregarFazenda(s.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) carregarFazenda(s.user.id);
      else { setFazendaId(null); setNomeFazenda(null); setFazendas([]); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function carregarFazenda(userId: string) {
    try {
      // Cache local para abertura rápida
      const cached = await AsyncStorage.getItem('fazenda_ativa');
      if (cached) {
        const { id, nome } = JSON.parse(cached);
        setFazendaId(id);
        setNomeFazenda(nome);
      }

      // Busca perfil + todas as fazendas da conta
      const { data: perfil } = await supabase
        .from('perfis')
        .select('fazenda_id, conta_id')
        .eq('user_id', userId)
        .single();

      if (perfil?.fazenda_id) {
        // Busca info da fazenda ativa
        const { data: faz } = await supabase
          .from('fazendas')
          .select('id, nome')
          .eq('id', perfil.fazenda_id)
          .single();

        if (faz) {
          setFazendaId(faz.id);
          setNomeFazenda(faz.nome);
          await AsyncStorage.setItem('fazenda_ativa', JSON.stringify({ id: faz.id, nome: faz.nome }));
        }
      }

      // Busca todas as fazendas da conta para switcher
      if (perfil?.conta_id) {
        const { data: todas } = await supabase
          .from('fazendas')
          .select('id, nome')
          .eq('conta_id', perfil.conta_id)
          .order('nome');
        setFazendas((todas ?? []) as Fazenda[]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async function signOut() {
    await AsyncStorage.removeItem('fazenda_ativa');
    await supabase.auth.signOut();
  }

  function setFazendaAtiva(id: string, nome: string) {
    setFazendaId(id);
    setNomeFazenda(nome);
    AsyncStorage.setItem('fazenda_ativa', JSON.stringify({ id, nome }));
    // Atualiza no banco em background
    if (user?.id) {
      supabase.from('perfis').update({ fazenda_id: id }).eq('user_id', user.id).then(() => {});
    }
  }

  return (
    <AuthContext.Provider value={{
      session, user, fazendaId, nomeFazenda, fazendas,
      emailUsuario: user?.email ?? null,
      loading, signIn, signOut, setFazendaAtiva,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
