import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://ptbougxydvxxdlhywhps.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0Ym91Z3h5ZHZ4eGRsaHl3aHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTQ3MzcsImV4cCI6MjA5MTMzMDczN30.6C6TVbETBaaOeipvqcapm-tZN-vLeUrslZSy0jZeT9A';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export { SUPABASE_URL };

// ── Tipos mínimos necessários para o Campo ──────────────────────────────────

export type Talhao = {
  id: string;
  fazenda_id: string;
  nome: string;
  area_ha: number;
  tipo_posse?: 'proprio' | 'arrendado';
};

export type Ciclo = {
  id: string;
  fazenda_id: string;
  cultura: string;
  descricao: string;
  ano_safra_id?: string;
};

export type MonitoramentoPraga = {
  id: string;
  fazenda_id: string;
  talhao_id: string;
  ciclo_id?: string;
  data_monitoramento: string;
  tipo: 'praga' | 'doenca' | 'planta_daninha';
  nome: string;
  nivel: number;
  percentual_infestacao?: number;
  estagio?: string;
  acao_recomendada?: string;
  obs?: string;
  lat?: number;
  lng?: number;
  fotos?: string[];
  created_at?: string;
};

export type Plantio = {
  id: string;
  fazenda_id: string;
  talhao_id: string;
  ciclo_id: string;
  data_plantio: string;
  variedade?: string;
  densidade_sementes_ha?: number;
  espacamento_cm?: number;
  area_plantada_ha?: number;
  operador?: string;
  maquina?: string;
  obs?: string;
};

export type Pulverizacao = {
  id: string;
  fazenda_id: string;
  talhao_id: string;
  ciclo_id: string;
  data_pulverizacao: string;
  area_ha?: number;
  volume_calda_ha?: number;
  operador?: string;
  maquina?: string;
  temperatura?: number;
  umidade?: number;
  velocidade_vento?: number;
  obs?: string;
};

export type LeituraPluviometrica = {
  id: string;
  fazenda_id: string;
  talhao_id: string | null;
  ponto_nome: string;
  data_leitura: string;
  hora_leitura: string | null;
  mm_chuva: number;
  operador: string | null;
  obs: string | null;
  created_at: string;
};

export type AnoSafra = {
  id: string;
  descricao: string;
};

export type InsumoEstoque = {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  estoque: number;
  custo_medio: number;
};

export type Abastecimento = {
  id: string;
  fazenda_id: string;
  maquina_id: string | null;
  maquina_descricao: string;
  data: string;
  insumo_id: string | null;
  tipo_combustivel: string | null;
  quantidade_l: number;
  valor_unitario: number;
  valor_total: number;
  ciclo_id: string | null;
  horimetro: number | null;
  km: number | null;
  operador: string | null;
  observacao: string | null;
  created_at: string;
  insumos?: { nome: string } | null;
  ciclos?: { descricao: string } | null;
};

export type Romaneio = {
  id: string;
  fazenda_id: string;
  talhao_id?: string;
  ciclo_id?: string;
  data_colheita: string;
  motorista?: string;
  placa?: string;
  destino?: string;
  peso_bruto_kg?: number;
  tara_kg?: number;
  peso_liquido_kg?: number;
  umidade_pct?: number;
  impureza_pct?: number;
  avariados_pct?: number;
  desconto_umidade_pct?: number;
  desconto_impureza_pct?: number;
  peso_final_kg?: number;
  sacas?: number;
};
