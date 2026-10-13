"use client";
import { useState, useEffect, useRef } from "react";
import AppearanceSettings from "./AppearanceSettings";
import ModernNavigation from "./ModernNavigation";
import { useLayout } from "./LayoutProvider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";
import type { Fazenda } from "../lib/supabase";


import { NAV, NAV_MODULE_MAP, extrairGrupos, type NavItem, type NavLink, type NavSubgroup, type NavChild } from "../lib/navigation";

// ─── Componente ──────────────────────────────────────────────
interface TopNavProps { automacoesAtivas?: number; global?: boolean }

export default function TopNav({ automacoesAtivas = 5, global = false }: TopNavProps) {
  const { modern } = useLayout();
  if (modern && !global) return null;
  return <TopNavContent automacoesAtivas={automacoesAtivas} modern={modern} />;
}

function TopNavContent({ automacoesAtivas, modern }: { automacoesAtivas: number; modern: boolean }) {
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
      .eq("fazenda_id", fazendaId)
      .eq("status", "pendente")
      .then(({ count }) => setQtdPendencias(count ?? 0));
  }, [fazendaId, pathname]);


  useEffect(() => {
    if (!fazendaId) return;
    const now = Date.now();
    if (now - lastTransfMs.current < 60_000) return;
    lastTransfMs.current = now;
    Promise.all([
      supabase.from("solicitacoes_transferencia").select("id", { count: "exact", head: true }).eq("fazenda_destino_id", fazendaId).eq("status", "pendente"),
      supabase.from("solicitacoes_transferencia_maquinas").select("id", { count: "exact", head: true }).eq("fazenda_destino_id", fazendaId).eq("status", "pendente"),
    ]).then(([r1, r2]) => setQtdTransferencias((r1.count ?? 0) + (r2.count ?? 0)));
  }, [fazendaId, pathname]);

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

  const isAtivo = (path: string) => {
    const [p, q] = path.split("?");
    if (q) {
      const params = new URLSearchParams(q);
      const tab = params.get("tab");
      const aba = params.get("aba");
      const cur = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
      if (tab) return pathname === p && cur.get("tab") === tab;
      if (aba) return pathname === p && cur.get("aba") === aba;
    }
    return pathname === path;
  };

  const grupoAtivo = (item: Extract<NavItem, { type: "group" }>) => {
    if (item.id === "producao")      return pathname.startsWith("/lavoura") || pathname.startsWith("/algodao") || pathname === "/estoque/romaneio-entrada" || pathname === "/mapa";
    if (item.id === "documentos-fiscais") return pathname.startsWith("/fiscal/documentos") || pathname === "/fiscal/notas-proprias" || pathname === "/fiscal/remessas" || pathname.startsWith("/fiscal/transferencia-maquinas") || pathname === "/fiscal/manifestacao" || pathname.startsWith("/transporte/cte") || pathname.startsWith("/transporte/mdfe");
    if (item.id === "comercial")     return pathname.startsWith("/contratos") || pathname.startsWith("/expedicao") || pathname.startsWith("/comercial") || (pathname.startsWith("/transporte") && !pathname.startsWith("/transporte/cte") && !pathname.startsWith("/transporte/mdfe")) || pathname.startsWith("/balanca") || pathname.startsWith("/compras") || (pathname.startsWith("/estoque") && pathname !== "/estoque/romaneio-entrada") || pathname === "/financeiro/pendencias-nf" || pathname === "/configuracoes/classificacao" || pathname === "/configuracoes/automacoes";
    if (item.id === "financeiro")    return (pathname.startsWith("/financeiro") && pathname !== "/financeiro/empresas") || pathname.startsWith("/empresas");
    if (item.id === "fiscal") {
      const ehRotaDeDocumentosFiscais = pathname.startsWith("/fiscal/documentos") || pathname === "/fiscal/notas-proprias" || pathname === "/fiscal/remessas" || pathname.startsWith("/fiscal/transferencia-maquinas") || pathname === "/fiscal/manifestacao";
      return (pathname.startsWith("/fiscal") && !ehRotaDeDocumentosFiscais) || pathname === "/lcdpr" || pathname === "/ibs" || pathname === "/parcerias";
    }
    if (item.id === "resultados")    return pathname.startsWith("/custos") || pathname.startsWith("/relatorios") || pathname === "/financeiro/empresas";
    if (item.id === "cadastros")     return pathname === "/cadastros" || pathname.startsWith("/cadastros");
    if (item.id === "configuracoes") return pathname.startsWith("/configuracoes") || pathname.startsWith("/admin");
    if (item.id === "ajuda")         return pathname === "/learning" || pathname === "/suporte";
    return false;
  };

  // Verifica se algum link dentro de um subgroup está ativo
  const subgroupAtivo = (sg: NavSubgroup) => sg.children.some(c => isAtivo(c.path));

  const isRaccotloStaff = ["raccotlo","raccotlo_gestor","raccotlo_seletor","raccotlo_operacional","bpo"].includes(userRole ?? "");

  // Sempre exibe contaNome (conta) ou nomeProdutor (AuthProvider) como identidade principal
  // fazenda?.nome é último recurso (exibia "Fazenda Frei Galvão" quando produtor não tinha join)
  const multiFazenda = fazendaIds.length > 1;
  const nomeIdentidade = contaNome ?? nomeProdutor ?? produtorNome ?? fazenda?.nome ?? null;
  const iniciaisFazenda = nomeIdentidade
    ? nomeIdentidade.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "—";

  // ── Renderiza item do dropdown (link, divider ou subgroup) ──
  function renderChild(child: NavChild, idx: number) {
    if (child.type !== "divider") {
      const mid = (child as NavLink | NavSubgroup).moduleId;
      if (mid && !podeAcessar(mid)) return null;
      if (mid && !podeAcessarPlano(mid)) return null;
    }

    // Divider
    if (child.type === "divider") {
      return (
        <div key={`div-${idx}`} style={{
          padding: idx === 0 ? "6px 14px 4px" : "10px 14px 4px",
          fontSize: 10, fontWeight: 700, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.07em",
          borderTop: idx > 0 ? "0.5px solid rgba(255,255,255,0.07)" : "none",
          marginTop: idx > 0 ? 4 : 0,
        }}>
          {child.label}
        </div>
      );
    }

    // Subgroup (flyout)
    if (child.type === "subgroup") {
      const sg = child as NavSubgroup;
      const isOpen = openSub === sg.id;
      const temAtivo = subgroupAtivo(sg);
      return (
        <div
          key={sg.id}
          style={{ position: "relative" }}
          onMouseEnter={() => setOpenSub(sg.id)}
          onMouseLeave={() => setOpenSub(null)}
        >
          <div style={{
            display: "flex", alignItems: "center",
            padding: "8px 14px", cursor: "default", gap: 8, whiteSpace: "nowrap",
            background: isOpen ? "rgba(59,130,246,0.12)" : temAtivo ? "rgba(59,130,246,0.08)" : "transparent",
            borderLeft: temAtivo ? "3px solid #3B82F6" : "3px solid transparent",
          }}>
            <span style={{ fontSize: 13, color: temAtivo ? "#FFFFFF" : "#CBD5E1", fontWeight: temAtivo ? 600 : 400 }}>
              {sg.label}
            </span>
            <span style={{ fontSize: 9, color: isOpen ? "#60A5FA" : "var(--text-3)", flexShrink: 0 }}>▶</span>
          </div>

          {isOpen && (
            <>
            <div style={{ position: "absolute", top: 0, left: "100%", width: 8, height: "100%", background: "transparent" }} />
            <div style={{
              position: "absolute", top: -6, left: "calc(100% + 4px)",
              background: "#112236", borderRadius: 10,
              border: "0.5px solid rgba(255,255,255,0.1)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
              minWidth: 210, zIndex: 1100, padding: "6px 0",
            }}>
              <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {sg.label}
              </div>
              {sg.children.filter(gc => (!gc.moduleId || podeAcessar(gc.moduleId)) && (!gc.moduleId || podeAcessarPlano(gc.moduleId))).map(gc => {
                const ativoGc = isAtivo(gc.path);
                return (
                  <Link
                    key={gc.id}
                    href={gc.path}
                    prefetch={false}
                    onClick={() => { setDropdown(null); setOpenSub(null); }}
                    style={{
                      display: "flex", alignItems: "center",
                      padding: "8px 14px", textDecoration: "none", fontSize: 13,
                      whiteSpace: "nowrap",
                      color: ativoGc ? "#FFFFFF" : "#CBD5E1",
                      fontWeight: ativoGc ? 600 : 400,
                      background: ativoGc ? "rgba(59,130,246,0.18)" : "transparent",
                      borderLeft: ativoGc ? "3px solid #3B82F6" : "3px solid transparent",
                    }}
                  >
                    {gc.label}
                  </Link>
                );
              })}
            </div>
            </>
          )}
        </div>
      );
    }

    // Link simples
    const link = child as NavLink;
    const ativoLink = isAtivo(link.path);
    if (link.disabled) {
      return (
        <span key={link.id} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", fontSize: 13, whiteSpace: "nowrap",
          color: "#64748B", cursor: "not-allowed", userSelect: "none",
        }}>
          {link.label}
          <span style={{ fontSize: 9, background: "#334155", color: "#94A3B8", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>EM BREVE</span>
        </span>
      );
    }
    return (
      <Link
        key={link.id}
        href={link.path}
        onClick={() => { setDropdown(null); setOpenSub(null); }}
        style={{
          display: "flex", alignItems: "center",
          padding: "8px 14px", textDecoration: "none", fontSize: 13,
          whiteSpace: "nowrap",
          color: ativoLink ? "#FFFFFF" : "#CBD5E1",
          fontWeight: ativoLink ? 600 : 400,
          background: ativoLink ? "rgba(59,130,246,0.18)" : "transparent",
          borderLeft: ativoLink ? "3px solid #3B82F6" : "3px solid transparent",
        }}
      >
        {link.label}
      </Link>
    );
  }

  return (
  <>
    {modern ? <ModernNavigation identity={nomeIdentidade} logo={logoArato} name={nomeArato} pending={qtdPendencias} transfers={qtdTransferencias} outdated={desatualizado} onApp={() => setShowQr(true)} /> : <header
      data-arato-legacy-navigation
      ref={navRef}
      style={{
        position: "sticky", top: 0, zIndex: 1000, flexShrink: 0,
        background: "var(--nav-faixa2)",
        boxShadow: "0 1px 0 var(--border-table), 0 4px 24px rgba(0,0,0,0.5)",
        fontFamily: "system-ui, sans-serif",
        overflow: "visible",
        marginLeft: "calc(-1 * var(--sidebar-w, 0px))",
        width: "calc(100% + var(--sidebar-w, 0px))",
      }}
    >
      {/* ── Faixa 1: identidade + usuário ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 52,
        background: "var(--bg-header)",
        borderBottom: "0.5px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {pathname !== "/" && (
            <button data-arato-button="secondary"
              onClick={() => router.back()}
              title="Voltar para a tela anterior"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "var(--bg-input)", border: "0.5px solid rgba(255,255,255,0.12)",
                borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                fontSize: 12, color: "var(--text-2)", fontWeight: 600,
              }}
            >
              ← Voltar
            </button>
          )}
          {logoArato ? (
            <img src={logoArato} alt={nomeArato} style={{ height: 32, maxWidth: 120, objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(255,255,255,0.55)) drop-shadow(0 0 2px rgba(255,255,255,0.9))" }} />
          ) : (
            <img src="https://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logos/Logo_Arato_Nova.png" alt="Arato" style={{ height: 32, width: "auto", objectFit: "contain", filter: "drop-shadow(0 0 8px rgba(255,255,255,0.55)) drop-shadow(0 0 2px rgba(255,255,255,0.9))" }} />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {(nomeIdentidade || fazenda) && !(userRole === "raccotlo" && fazendaId && (nomeProdutor || nomeFazendaSelecionada)) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px" }}>
              {logoCliente ? (
                <img src={logoCliente} alt="Logo cliente" style={{ width: 30, height: 30, borderRadius: 7, objectFit: "contain", border: "0.5px solid rgba(255,255,255,0.15)" }} />
              ) : (
                <div style={{ width: 30, height: 30, borderRadius: 7, background: "var(--border)", border: "0.5px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#60A5FA" }}>
                  {iniciaisFazenda}
                </div>
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.25 }}>
                  {nomeIdentidade ?? "—"}
                </div>
              </div>
            </div>
          )}

          <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)" }} />

          {(userRole === "raccotlo" || isBpo) && fazendaId && nomeProdutor && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {logoCliente
                ? <img src={logoCliente} alt="" style={{ height: 24, width: 24, objectFit: "contain", borderRadius: 4, border: "0.5px solid rgba(255,255,255,0.15)" }} />
                : (
                  <div style={{ width: 24, height: 24, borderRadius: 4, background: "rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#60A5FA", flexShrink: 0 }}>
                    {nomeProdutor.substring(0, 2).toUpperCase()}
                  </div>
                )
              }
              <div style={{ maxWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nomeProdutor}
                </div>
              </div>
              <button data-arato-button="secondary"
                onClick={clearFazenda}
                style={{
                  background: "var(--border-table)", border: "0.5px solid rgba(255,255,255,0.12)",
                  borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                  fontSize: 11, color: "var(--text-2)", fontWeight: 600,
                }}
              >
                Trocar cliente
              </button>
              <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button data-arato-button="secondary"
              onClick={() => setShowQr(true)}
              title="App Campo — instalar no celular"
              style={{ background: "var(--bg-input)", border: "0.5px solid rgba(255,255,255,0.12)", cursor: "pointer", color: "var(--text-2)", fontSize: 15, padding: "4px 8px", borderRadius: 6, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 28 }}
            >
              📱
            </button>
            <a
              href="/atualizacoes"
              title="Central de Atualizações"
              style={{ background: "var(--bg-input)", border: "0.5px solid rgba(255,255,255,0.12)", cursor: "pointer", color: "var(--text-2)", fontSize: 15, padding: "4px 8px", borderRadius: 6, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 28, textDecoration: "none" }}
            >
              🆕
            </a>
            <div ref={bellRef} style={{ position: "relative" }}>
              <button data-arato-button="toggle"
                onClick={() => setShowBell(v => !v)}
                title={desatualizado ? "Nova versão disponível" : qtdTransferencias > 0 ? `${qtdTransferencias} solicitação(ões) pendente(s)` : "Notificações"}
                style={{ position: "relative", background: desatualizado || qtdTransferencias > 0 ? "rgba(220,38,38,0.15)" : "var(--bg-input)", border: `0.5px solid ${desatualizado || qtdTransferencias > 0 ? "rgba(220,38,38,0.4)" : "rgba(255,255,255,0.12)"}`, cursor: "pointer", color: "var(--text-2)", fontSize: 15, padding: "4px 8px", borderRadius: 6, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 28 }}
              >
                🔔
                {(desatualizado || qtdTransferencias > 0) && (
                  <span style={{ position: "absolute", top: -4, right: -4, background: "#DC2626", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                    {(desatualizado ? 1 : 0) + qtdTransferencias > 9 ? "9+" : (desatualizado ? 1 : 0) + qtdTransferencias}
                  </span>
                )}
              </button>
              {showBell && (
                <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-modal)", minWidth: 240, zIndex: 9999, overflow: "hidden" }}>
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
                </div>
              )}
            </div>
            {/* ── Seletor de Paleta ── */}
            <div ref={palRef} style={{ position: "relative" }}>
              <button data-arato-button="toggle"
                onClick={() => setShowPalette(v => !v)}
                title="Escolher paleta e modo de exibição"
                aria-label="Aparência"
                aria-expanded={showPalette}
                style={{ background: showPalette ? "rgba(201,146,27,0.18)" : "var(--bg-input)", border: `0.5px solid ${showPalette ? "rgba(201,146,27,0.5)" : "rgba(255,255,255,0.12)"}`, cursor: "pointer", color: "var(--text-2)", fontSize: 15, padding: "4px 8px", borderRadius: 6, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 28 }}
              >
                🎨
              </button>
              {showPalette && (
                <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-modal)", padding: 10, display: "flex", flexDirection: "column", gap: 4, width: 270, maxWidth: "calc(100vw - 32px)", maxHeight: "70vh", overflowY: "auto", zIndex: 9999 }}>
                  <AppearanceSettings compact />
                </div>
              )}
            </div>

            <div style={{ width: 28, height: 28, background: "#C9921B", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {nomeUsuario ? nomeUsuario.substring(0, 2).toUpperCase() : "—"}
            </div>
            {nomeUsuario && (
              <span style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 500, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nomeUsuario}
              </span>
            )}
            <button data-arato-button="secondary" onClick={signOut} style={{ background: "var(--bg-input)", border: "0.5px solid rgba(255,255,255,0.12)", cursor: "pointer", color: "var(--text-2)", fontSize: 12, padding: "4px 10px", borderRadius: 6 }}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* ── Faixa 2: navegação ── */}
      <nav style={{ display: "flex", alignItems: "center", padding: "0 20px", height: 38, gap: 1, background: "var(--nav-faixa2)", overflow: "visible" }}>
        {NAV.map(item => {
          const navId  = item.type === "group" ? item.id : (item as NavLink).id;
          const modulos = NAV_MODULE_MAP[navId];
          if (!isRaccotloStaff && modulos && !modulos.some(m => podeAcessar(m))) return null;
          if (modulos && !modulos.some(m => podeAcessarPlano(m))) return null;

          const isLocked = onboardingAtivo && (item.minStep ?? 0) > stepsCompletos;
          if (isLocked) {
            return (
              <div key={item.type === "group" ? item.id : (item as NavLink).id} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 5,
                color: "rgba(255,255,255,0.2)",
                fontSize: 13, cursor: "not-allowed", userSelect: "none",
                whiteSpace: "nowrap",
              }} title={`Disponível após a etapa ${item.minStep ?? 0} da implantação`}>
                {"label" in item ? item.label : ""}
                <span style={{ fontSize: 9, opacity: 0.5 }}>🔒</span>
              </div>
            );
          }

          if (item.type === "group") {
            const ativo = grupoAtivo(item);
            const open  = dropdown === item.id;

            // ── Painel duplo ──
            if (item.panel) {
              const grupos         = extrairGrupos(item.children);
              const gruposVisiveis = grupos.filter(g =>
                g.items.some(i => !i.moduleId || (podeAcessar(i.moduleId) && podeAcessarPlano(i.moduleId)))
              );
              const grupoAtual = gruposVisiveis.find(g => g.label === panelGroup) ?? gruposVisiveis[0];
              return (
                <div key={item.id} style={{ position: "relative" }}>
                  <button data-arato-button="toggle"
                    onClick={() => { setDropdown(open ? null : item.id); setOpenSub(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: 5, border: "none",
                      background: ativo ? "rgba(255,255,255,0.12)" : open ? "rgba(255,255,255,0.07)" : "transparent",
                      cursor: "pointer", whiteSpace: "nowrap",
                      color: ativo ? "#FFFFFF" : "rgba(255,255,255,0.62)", fontWeight: ativo ? 600 : 400, fontSize: 13,
                    }}
                  >
                    {item.label}
                    <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▼</span>
                  </button>

                  {open && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 4px)", left: 0,
                      background: "#112236", borderRadius: 10,
                      border: "0.5px solid rgba(255,255,255,0.1)",
                      boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                      zIndex: 1100, display: "flex", overflow: "hidden", minWidth: 360,
                    }}>
                      <div style={{ width: 160, background: "var(--nav-bg)", borderRight: "0.5px solid rgba(255,255,255,0.07)", padding: "6px 0" }}>
                        {gruposVisiveis.map(g => {
                          const sel = g.label === panelGroup;
                          const temAtivo = g.items.some(i => isAtivo(i.path));
                          return (
                            <div
                              key={g.label}
                              onMouseEnter={() => setPanelGroup(g.label)}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "9px 14px", cursor: "default",
                                background: sel ? "#112236" : "transparent",
                                borderLeft: sel ? "3px solid #3B82F6" : "3px solid transparent",
                                borderRight: sel ? "0.5px solid #112236" : "none",
                                marginRight: sel ? -1 : 0,
                              }}
                            >
                              <span style={{ fontSize: 13, fontWeight: sel || temAtivo ? 600 : 400, color: temAtivo ? "#60A5FA" : "#CBD5E1" }}>
                                {g.label}
                              </span>
                              <span style={{ fontSize: 9, color: sel ? "#3B82F6" : "var(--text-3)" }}>▶</span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ flex: 1, padding: "6px 0", minWidth: 180 }}>
                        <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                          {grupoAtual?.label}
                        </div>
                        {grupoAtual?.items.filter(i => !i.moduleId || (podeAcessar(i.moduleId) && podeAcessarPlano(i.moduleId))).map(child => {
                          const ativoChild = isAtivo(child.path);
                          return (
                            <Link
                              key={child.id}
                              href={child.path}
                              prefetch={false}
                              onClick={() => setDropdown(null)}
                              style={{
                                display: "flex", alignItems: "center",
                                padding: "8px 14px", textDecoration: "none", fontSize: 13,
                                color: ativoChild ? "#FFFFFF" : "#CBD5E1",
                                fontWeight: ativoChild ? 600 : 400,
                                background: ativoChild ? "rgba(59,130,246,0.18)" : "transparent",
                                borderLeft: ativoChild ? "3px solid #3B82F6" : "3px solid transparent",
                              }}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // ── Dropdown com subgroups ──
            return (
              <div key={item.id} style={{ position: "relative" }}>
                <button data-arato-button="toggle"
                  onClick={() => { setDropdown(open ? null : item.id); setOpenSub(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 10px", borderRadius: 5, border: "none",
                    background: ativo ? "rgba(255,255,255,0.12)" : open ? "rgba(255,255,255,0.07)" : "transparent",
                    cursor: "pointer", whiteSpace: "nowrap",
                    color: ativo ? "#FFFFFF" : "rgba(255,255,255,0.62)", fontWeight: ativo ? 600 : 400, fontSize: 13,
                  }}
                >
                  {item.label}
                  <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▼</span>
                </button>

                {open && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0,
                    background: "#112236", borderRadius: 10,
                    border: "0.5px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                    minWidth: 220, zIndex: 1100, padding: "6px 0",
                  }}>
                    {item.children.map((child, idx) => renderChild(child, idx))}
                  </div>
                )}
              </div>
            );
          }

          // ── Link simples ──
          const ativo = isAtivo((item as NavLink).path);
          return (
            <Link
              key={item.id}
              href={(item as NavLink).path}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 5, textDecoration: "none",
                background: ativo ? "rgba(255,255,255,0.12)" : "transparent",
                color: ativo ? "#FFFFFF" : "rgba(255,255,255,0.62)", fontWeight: ativo ? 600 : 400, fontSize: 13, whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          );
        })}

        {qtdPendencias > 0 && (
          <Link
            href="/pendencias/operacionais"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 5, textDecoration: "none",
              background: pathname.startsWith("/pendencias") ? "rgba(255,255,255,0.12)" : "rgba(245,158,11,0.15)",
              color: "#FCD34D", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
              border: "0.5px solid rgba(245,158,11,0.3)",
            }}
          >
            Pendências
            <span style={{
              background: "#F59E0B", color: "#000", borderRadius: 20,
              fontSize: 10, fontWeight: 800, padding: "1px 6px", lineHeight: 1.5,
            }}>
              {qtdPendencias}
            </span>
          </Link>
        )}

        {/* BPO: botão de administração próprio */}
        {userRole === "bpo" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <Link
              href="/bpo/admin"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 12px", borderRadius: 5, textDecoration: "none",
                background: pathname.startsWith("/bpo/admin") ? "rgba(201,146,27,0.25)" : "rgba(201,146,27,0.12)",
                color: "#FCD34D", fontWeight: pathname.startsWith("/bpo/admin") ? 700 : 600,
                fontSize: 13, whiteSpace: "nowrap",
                border: "0.5px solid rgba(201,146,27,0.35)",
              }}
            >
              ⚙ Admin BPO
            </Link>
            <Link
              href="/bpo/seletor-cliente"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 5, textDecoration: "none",
                background: pathname.startsWith("/bpo/seletor") ? "rgba(255,255,255,0.12)" : "transparent",
                color: "rgba(255,255,255,0.55)", fontWeight: 400,
                fontSize: 12, whiteSpace: "nowrap",
                border: "0.5px solid rgba(255,255,255,0.18)",
              }}
            >
              Trocar cliente
            </Link>
          </div>
        )}

        {(userRole === "raccotlo" || userRole === "raccotlo_gestor" || userRole === "raccotlo_seletor") && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            {raccotloGestor && (
              <Link
                href="/admin"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 12px", borderRadius: 5, textDecoration: "none",
                  background: pathname.startsWith("/admin") ? "rgba(201,146,27,0.25)" : "rgba(201,146,27,0.12)",
                  color: "#FCD34D", fontWeight: pathname.startsWith("/admin") ? 700 : 600,
                  fontSize: 13, whiteSpace: "nowrap",
                  border: "0.5px solid rgba(201,146,27,0.35)",
                }}
              >
                ⚙ Gestão Arato
              </Link>
            )}
            {(userRole === "raccotlo" || userRole === "raccotlo_gestor" || userRole === "raccotlo_seletor") && (
              <>
                <Link
                  href="/bi"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 5, textDecoration: "none",
                    background: pathname === "/bi" ? "rgba(255,255,255,0.12)" : "transparent",
                    color: pathname === "/bi" ? "#FFFFFF" : "rgba(255,255,255,0.55)", fontWeight: pathname === "/bi" ? 600 : 400,
                    fontSize: 12, whiteSpace: "nowrap",
                    border: "0.5px solid rgba(255,255,255,0.18)",
                  }}
                >
                  BI Raccolto
                </Link>
                <Link
                  href="/raccotlo"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 5, textDecoration: "none",
                    background: pathname === "/raccotlo" ? "rgba(255,255,255,0.12)" : "transparent",
                    color: "rgba(255,255,255,0.35)", fontWeight: 400,
                    fontSize: 12, whiteSpace: "nowrap",
                    border: "0.5px solid var(--border)",
                  }}
                >
                  Hub
                </Link>
              </>
            )}
          </div>
        )}
      </nav>
    </header>}

    {/* ── Modal QR Code App Campo ── */}
    {showQr && (
      <div data-arato-statistic="action" data-arato-overlay="true"
        onClick={() => setShowQr(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <div data-arato-dialog="confirmation"
          onClick={e => e.stopPropagation()}
          style={{ background: "var(--bg-card)", borderRadius: 20, padding: 28, maxWidth: 320, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", textAlign: "center" }}
        >
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
        </div>
      </div>
    )}
  </>
  );
}
