"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import AppearanceSettings from "./AppearanceSettings";
import { hasClientWorkspace } from "../lib/layout-preferences";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";
import type { Fazenda } from "../lib/supabase";
import { NAV, NAV_MODULE_MAP, extrairGrupos, type NavItem, type NavLink, type NavSubgroup, type NavChild } from "../lib/navigation";
import ContextPanel from './arato-layout/ContextPanel';
import type {ContextAction} from './arato-layout/ContextPanel';
export default function OperationalContext({automacoesAtivas=5}:{automacoesAtivas?:number}){
  const [dropdown,         setDropdown]         = useState<string | null>(null);
  const [openSub,          setOpenSub]          = useState<string | null>(null);
  const [panelGroup,       setPanelGroup]        = useState<string>("");
  const [fazenda,          setFazenda]          = useState<Fazenda | null>(null);
  const [produtorNome,     setProdutorNome]     = useState<string | null>(null);
  const [logoArato,        setLogoArato]        = useState<string | null>(null);
  const [nomeArato,        setNomeArato]        = useState("Arato");
  const [qtdPendencias,    setQtdPendencias]    = useState(0);
  const [qtdTransferencias,setQtdTransferencias]= useState(0);
  const [showQr,           setShowQr]           = useState(false);
  const [qrDataUrl,        setQrDataUrl]        = useState("");
  const [showPalette,      setShowPalette]      = useState(false);
  const [showBell,         setShowBell]         = useState(false);
  const [desatualizado,    setDesatualizado]    = useState(false);
  const palRef  = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const versaoInicial = useRef<string | null>(null);
  const lastPendenciasMs   = useRef<number>(0);
  const lastTransfMs       = useRef<number>(0);
  const prevQtdTransfRef   = useRef<number>(0);

  const pathname = usePathname();
  const router = useRouter();
  const { fazendaId, fazendaIds, contaId, contaNome, nomeUsuario, signOut, userRole, raccotloGestor, isBpo, nomeFazendaSelecionada, nomeProdutor, clearFazenda, onboardingAtivo, stepsCompletos, podeAcessar, podeAcessarPlano, logoCliente, anoSafraVigenteDesc } = useAuth();
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fazendaId) return;
    // JOIN com produtores para evitar waterfall de 2 queries sequenciais
    supabase.from("fazendas")
      .select("*, produtores(nome)")
      .eq("id", fazendaId)
      .single()
      .then(({ data }) => {
        if (data) {
          setFazenda(data);
          const pNome = (data.produtores as { nome?: string } | null)?.nome ?? null;
          setProdutorNome(pNome);
        }
      });
  }, [fazendaId]);

  useEffect(() => {
    if (!fazendaId) return;
    // Throttle: no máximo 1 consulta a cada 60s — evita roundtrip em cada navegação
    const now = Date.now();
    if (now - lastPendenciasMs.current < 60_000) return;
    lastPendenciasMs.current = now;
    supabase
      .from("pendencias_operacionais")
      .select("id", { count: "exact", head: true })
      .in("fazenda_id", fazendaIds.length ? fazendaIds : [fazendaId])
      .eq("status", "pendente")
      .then(({ count }) => setQtdPendencias(count ?? 0));
  }, [fazendaId, fazendaIds, pathname]);


  useEffect(() => {
    if (!fazendaId) return;
    const now = Date.now();
    if (now - lastTransfMs.current < 60_000) return;
    lastTransfMs.current = now;
    Promise.all([
      supabase.from("solicitacoes_transferencia").select("id", { count: "exact", head: true }).in("fazenda_destino_id", fazendaIds.length ? fazendaIds : [fazendaId]).eq("status", "pendente"),
      supabase.from("solicitacoes_transferencia_maquinas").select("id", { count: "exact", head: true }).in("fazenda_destino_id", fazendaIds.length ? fazendaIds : [fazendaId]).eq("status", "pendente"),
    ]).then(([r1, r2]) => setQtdTransferencias((r1.count ?? 0) + (r2.count ?? 0)));
  }, [fazendaId, fazendaIds, pathname]);

  // Toca som de notificação quando qtdTransferencias aumenta (nova solicitação do app)
  useEffect(() => {
    if (qtdTransferencias > prevQtdTransfRef.current) {
      try {
        const ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        osc.onended = () => ctx.close();
      } catch {
        // AudioContext não disponível (SSR ou navegador restrito)
      }
    }
    prevQtdTransfRef.current = qtdTransferencias;
  }, [qtdTransferencias]);

  useEffect(() => {
    // Logo do sistema: lida do Supabase Storage (bucket "logos", arquivo "arato.png")
    // Para trocar a logo: Supabase → Storage → logos → fazer upload do novo arquivo com o mesmo nome
    const { data } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (data?.publicUrl) setLogoArato(data.publicUrl);
  }, []);

  // Aba aberta numa versão antiga: ao trocar de tela, recarrega por completo. Sem isso, o clique num atalho
  // abria a tela da versão antiga (a aba continuava com o código velho e telas já removidas reapareciam).
  const pathnameAnterior = useRef(pathname);
  useEffect(() => {
    if (pathnameAnterior.current !== pathname && desatualizado) { window.location.reload(); return; }
    pathnameAnterior.current = pathname;
  }, [pathname, desatualizado]);

  // Verificação de nova versão — polling a cada 3 minutos
  useEffect(() => {
    async function checarVersao() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { deploymentId } = await r.json() as { deploymentId: string };
        if (!versaoInicial.current) {
          versaoInicial.current = deploymentId;
        } else if (deploymentId !== versaoInicial.current) {
          setDesatualizado(true);
        }
      } catch { /* ignora falha de rede */ }
    }
    checarVersao();
    const id = setInterval(checarVersao, 3 * 60 * 1000);
    // Ao voltar para a aba (ficou aberta por horas/dias), confere na hora
    const aoVoltar = () => { if (document.visibilityState === "visible") checarVersao(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", aoVoltar); };
  }, []);

  // Fechar dropdown do sino ao clicar fora
  useEffect(() => {
    if (!showBell) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setShowBell(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showBell]);

  useEffect(() => {
    if (!showQr || qrDataUrl) return;
    import("qrcode").then(QRCode => {
      QRCode.toDataURL("https://campo.arato.agr.br", {
        width: 240, margin: 2,
        color: { dark: "#111111", light: "#ffffff" },
      }).then(setQrDataUrl);
    });
  }, [showQr, qrDataUrl]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setDropdown(null);
        setOpenSub(null);
      }
      if (palRef.current && !palRef.current.contains(e.target as Node)) {
        setShowPalette(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  
 const actions:ContextAction[]=[];
 // As condições e destinos são os mesmos do TopNav da base revisada.
 if((userRole === "raccotlo" || isBpo) && fazendaId && nomeProdutor)actions.push({id:'switch-client',label:'Trocar cliente',detail:'Voltar à seleção de clientes',onClick:clearFazenda});
 if(userRole === "bpo"){
  actions.push({id:'bpo-admin',label:'Admin BPO',href:'/bpo/admin'});
  actions.push({id:'bpo-client',label:'Selecionar cliente BPO',href:'/bpo/seletor-cliente'});
 }
 if(userRole === "raccotlo" || userRole === "raccotlo_gestor" || userRole === "raccotlo_seletor"){
  if(raccotloGestor)actions.push({id:'admin',label:'Gestão Arato',href:'/admin'});
  actions.push({id:'bi',label:'BI Raccolto',href:'/bi'});
  actions.push({id:'hub',label:'Hub',href:'/raccotlo'});
 }

 return <ContextPanel client={contaNome??''} producer={nomeProdutor??produtorNome??''} farm={nomeFazendaSelecionada??fazenda?.nome??''} season={anoSafraVigenteDesc??''} user={nomeUsuario??''} role={userRole} pending={qtdPendencias} transfers={qtdTransferencias} outdated={desatualizado} actions={actions} onBack={()=>router.back()} onSignOut={signOut} onApp={()=>{setShowBell(false);setShowPalette(false);setShowQr(true);}} onAppearance={()=>{setShowBell(false);setShowQr(false);setShowPalette(true);}} onNotifications={()=>{setShowPalette(false);setShowQr(false);setShowBell(true);}} panel={showBell?'notifications':showPalette?'appearance':showQr?'app':null} onClose={()=>{setShowBell(false);setShowPalette(false);setShowQr(false);}} notifications={<div ref={bellRef}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", padding: "8px 14px 6px", borderBottom: "0.5px solid var(--border)" }}>Notificações</div>
                  {desatualizado && (
                    <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--border)", background: "rgba(201,146,27,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 16 }}>🔄</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>Nova versão disponível</span>
                      </div>
                      <button data-arato-button="primary"
                        onClick={() => { setDesatualizado(false); setShowBell(false); window.location.reload(); }}
                        style={{ width: "100%", padding: "6px 12px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        Atualizar agora
                      </button>
                    </div>
                  )}
                  {qtdTransferencias > 0 ? (
                    <a
                      href="/pendencias/operacionais"
                      onClick={() => setShowBell(false)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", textDecoration: "none", color: "var(--text-1)" }}
                    >
                      <span style={{ background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{qtdTransferencias > 9 ? "9+" : qtdTransferencias}</span>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>Solicitação(ões) de transferência pendente(s)</span>
                    </a>
                  ) : !desatualizado ? (
                    <div style={{ padding: "14px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>Sem notificações</div>
                  ) : null}
                  <div style={{ borderTop: "0.5px solid var(--border)", padding: "8px 14px" }}>
                    <a href="/pendencias/operacionais" onClick={() => setShowBell(false)} style={{ fontSize: 11, color: "var(--text-3)", textDecoration: "none" }}>Ver todas as pendências →</a>
                  </div>
                </div>} appearance={<div ref={palRef}><AppearanceSettings compact /></div>} app={<div className="native-context-app">
          <div data-arato-dialog-body="true" style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginBottom: 4 }}>📱 App Campo</div>
          <div data-arato-dialog-body="true" style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 20 }}>
            Escaneie o QR Code com o celular para abrir e instalar o app
          </div>

          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR Code App Campo" style={{ width: 200, height: 200, borderRadius: 12, border: "0.5px solid var(--border)" }} />
            : <div style={{ width: 200, height: 200, borderRadius: 12, background: "var(--bg-page)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <div style={{ width: 24, height: 24, border: "3px solid #111111", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
          }

          <div data-arato-dialog-body="true" data-arato-dialog-heading="true" style={{ marginTop: 16, background: "var(--bg-page)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "monospace" }}>campo.arato.agr.br</span>
            <button data-arato-button="secondary"
              onClick={() => { navigator.clipboard.writeText("https://campo.arato.agr.br"); }}
              style={{ fontSize: 11, fontWeight: 700, color: "#111111", background: "#E8E8E8", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
            >
              Copiar
            </button>
          </div>

          <div data-arato-dialog-body="true" style={{ marginTop: 16, fontSize: 12, color: "var(--text-3)", lineHeight: 1.7, textAlign: "left" }}>
            <strong style={{ color: "var(--text-2)" }}>iPhone:</strong> Abrir no Safari → Compartilhar → Adicionar à Tela de Início<br />
            <strong style={{ color: "var(--text-2)" }}>Android:</strong> Abrir no Chrome → banner "Instalar" ou ⋮ → Adicionar à tela inicial
          </div>

          <button data-arato-button="primary"
            onClick={() => setShowQr(false)}
            style={{ marginTop: 20, width: "100%", padding: "12px", background: "#111111", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            Fechar
          </button>
        </div>}/>;
}
