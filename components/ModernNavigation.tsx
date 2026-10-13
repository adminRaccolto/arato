"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";
import AppearanceSettings from "./AppearanceSettings";
import Icon from "./NavigationIcon";
import { activeDestination, canShowLink, modernNavigation, type ModernLink } from "../lib/modern-navigation";
import { CATALOGO_ATALHOS } from "./SidebarAtalhos";

interface Props { identity: string | null; logo: string | null; name: string; pending: number; transfers: number; outdated: boolean; onApp: () => void; }
const FAVORITES_KEY = "arato-atalhos-v2";
function savedFavorites(): string[] {
  try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "null"); if (Array.isArray(value)) return value.filter(id => typeof id === "string"); } catch { /* */ }
  return ["cp", "cr", "nf", "contratos", "estoque", "plantio"];
}
export default function ModernNavigation({ identity, logo, name, pending, transfers, outdated, onApp }: Props) {
  const auth = useAuth(), pathname = usePathname(), query = useSearchParams().toString(), router = useRouter();
  const staff = ["raccotlo", "raccotlo_gestor", "raccotlo_seletor", "raccotlo_operacional", "bpo"].includes(auth.userRole ?? "");
  const groups = modernNavigation().map(g => ({ ...g, links: g.links.filter(l => canShowLink(l, auth.podeAcessar, auth.podeAcessarPlano, staff)) })).filter(g => g.links.length);
  const active = groups.flatMap(g => g.links).filter(l => activeDestination(l.path, pathname, query)).sort((a, b) => b.path.length - a.path.length)[0];
  const activeGroup = groups.find(g => g.links.includes(active));
  const [expanded, setExpanded] = useState<Set<string>>(new Set(activeGroup ? [activeGroup.id] : []));
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("arato-navigation-collapsed") === "1"; } catch { return false; } }), [drawer, setDrawer] = useState(false), [search, setSearch] = useState("");
  const [popover, setPopover] = useState<"appearance" | "user" | "notifications" | null>(null);
  const [favorites, setFavorites] = useState<string[]>(savedFavorites);
  const tools = useRef<HTMLDivElement>(null), sidebar = useRef<HTMLElement>(null), menu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.documentElement.dataset.navigationCollapsed = String(collapsed);
    return () => { delete document.documentElement.dataset.navigationCollapsed; };
  }, [collapsed]);
  const routeKey = `${pathname}?${query}|${activeGroup?.id ?? ""}`;
  const [previousRoute, setPreviousRoute] = useState(routeKey);
  if (previousRoute !== routeKey) {
    setPreviousRoute(routeKey); setDrawer(false); setPopover(null);
    if (activeGroup) setExpanded(previous => new Set([...previous, activeGroup.id]));
  }
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!tools.current?.contains(event.target as Node)) setPopover(null); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && (popover || drawer)) { setPopover(null); setDrawer(false); menu.current?.focus(); }
      if (event.key === "Tab" && drawer) {
        const controls = sidebar.current?.querySelectorAll<HTMLElement>('a[href],button,input,summary');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", key);
    if (drawer) sidebar.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [drawer, popover]);
  const favoriteOptions = CATALOGO_ATALHOS.filter(f => groups.some(g => g.links.some(l => l.path === f.path)));
  const favoriteItems = favoriteOptions.filter(f => favorites.includes(f.id));
  function toggleFavorite(id: string) {
    const next = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
    setFavorites(next); try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* */ }
  }
  function navigateMenu() {
    if (window.matchMedia("(max-width: 1000px)").matches) setDrawer(!drawer);
    else { const next = !collapsed; setCollapsed(next); try { localStorage.setItem("arato-navigation-collapsed", String(next)); } catch { /* */ } }
  }
  function renderLink(link: ModernLink) {
    const locked = link.disabled || (auth.onboardingAtivo && auth.stepsCompletos < link.minStep);
    if (locked) return <span key={link.id} className="modern-nav-link modern-nav-locked" aria-disabled="true" title="Conclua as etapas de configuração para acessar">{link.label}<span aria-hidden="true">⌑</span></span>;
    return <Link key={link.id} href={link.path} prefetch={false} className="modern-nav-link" aria-current={active?.id === link.id ? "page" : undefined} onClick={() => setDrawer(false)}>{link.label}</Link>;
  }
  const initials = (auth.nomeUsuario ?? "Usuário").split(" ").slice(0, 2).map(w => w[0]).join("");
  return <>
    <a href="#arato-content" className="modern-skip-link">Ir para o conteúdo</a>
    {drawer && <button type="button" className="modern-nav-backdrop" aria-label="Fechar navegação" onClick={() => setDrawer(false)} />}
    <aside ref={sidebar} className={`modern-sidebar${drawer ? " is-open" : ""}`} aria-label="Navegação principal" role={drawer ? "dialog" : undefined} aria-modal={drawer || undefined}>
      <div className="modern-brand"><Link href="/" aria-label={`${name} — Início`}>{logo ? <Image src={logo} alt={name} width={150} height={30} unoptimized /> : <strong>{name}</strong>}</Link><button type="button" aria-label="Fechar navegação" className="modern-mobile-close" onClick={() => setDrawer(false)}><Icon name="close" /></button></div>
      <label className="modern-menu-search"><Icon name="search" /><span className="modern-sr-only">Buscar função no menu</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no menu…" /></label>
      <nav className="modern-menu">
        {groups.map(group => {
          const term = search.trim().toLocaleLowerCase("pt-BR"), links = term ? group.links.filter(l => `${group.label} ${l.label} ${l.section}`.toLocaleLowerCase("pt-BR").includes(term)) : group.links;
          if (!links.length) return null;
          if (group.id === "inicio") return <Link href="/" key={group.id} className="modern-module" aria-current={pathname === "/" ? "page" : undefined}><Icon name={group.icon} /><span>Início</span></Link>;
          const open = !!term || expanded.has(group.id);
          return <div className="modern-module-group" key={group.id}>
            <button type="button" className="modern-module" aria-expanded={open} aria-controls={`modern-group-${group.id}`} data-active={activeGroup?.id === group.id} onClick={() => setExpanded(prev => { const next = new Set(prev); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}><Icon name={group.icon} /><span>{group.label}</span><span className={open ? "modern-chevron is-open" : "modern-chevron"}><Icon name="chevron" size={14} /></span></button>
            {open && <div className="modern-module-links" id={`modern-group-${group.id}`}>
              {[...new Set(links.map(l => l.section))].map(label => {
                const entries = links.filter(l => l.section === label);
                if (!label) return entries.map(renderLink);
                const currentSection = active?.section === label && activeGroup?.id === group.id;
                return <details key={label} className="modern-menu-subsection" open={!!term || currentSection || label === links[0].section}>
                  <summary>{label}</summary>{entries.map(renderLink)}
                </details>;
              })}
            </div>}
          </div>;
        })}
        {search && !groups.some(g => g.links.some(l => `${g.label} ${l.label} ${l.section}`.toLowerCase().includes(search.trim().toLowerCase()))) && <p className="modern-nav-empty">Nenhuma função encontrada.</p>}
      </nav>
      <div className="modern-favorites"><div className="modern-menu-section"><Icon name="star" size={14} />Atalhos</div>{favoriteItems.map(item => <Link key={item.id} href={item.path} prefetch={false} className="modern-nav-link" onClick={() => setDrawer(false)}>{item.label}</Link>)}<details><summary>Editar atalhos</summary>{favoriteOptions.map(item => <label key={item.id}><input type="checkbox" checked={favorites.includes(item.id)} onChange={() => toggleFavorite(item.id)} />{item.label}</label>)}</details></div>
    </aside>
    <header className="modern-topbar" data-arato-modern-navigation>
      <div className="modern-context"><button ref={menu} type="button" onClick={navigateMenu} aria-label="Abrir ou recolher navegação" aria-expanded={drawer || !collapsed}><Icon name="menu" /></button>{pathname !== "/" && <button type="button" onClick={() => router.back()} title="Voltar" aria-label="Voltar à tela anterior"><Icon name="back" /></button>}<div><span>Cliente ativo</span><strong>{identity ?? "Arato"}</strong></div>{(auth.userRole === "raccotlo" || auth.isBpo) && auth.fazendaId && auth.nomeProdutor && <button type="button" onClick={auth.clearFazenda}>Trocar cliente</button>}{auth.userRole === "bpo" && <Link href="/bpo/seletor-cliente">Trocar cliente</Link>}</div>
      <div className="modern-tools" ref={tools}>
        {outdated && <button type="button" className="modern-update" onClick={() => window.location.reload()}>Atualizar versão</button>}
        <div className="modern-tool-wrap"><button type="button" aria-label="Temas e aparência" aria-expanded={popover === "appearance"} onClick={() => setPopover(popover === "appearance" ? null : "appearance")}><Icon name="palette" /></button>{popover === "appearance" && <div className="modern-popover modern-appearance"><AppearanceSettings compact /></div>}</div>
        <div className="modern-tool-wrap"><button type="button" aria-label={`Notificações: ${pending + transfers}`} aria-expanded={popover === "notifications"} onClick={() => setPopover(popover === "notifications" ? null : "notifications")}><Icon name="bell" />{pending + transfers > 0 && <span className="modern-notification-count">{pending + transfers}</span>}</button>{popover === "notifications" && <div className="modern-popover"><strong>Notificações</strong><Link href="/pendencias/operacionais">Pendências operacionais <span>{pending}</span></Link><Link href="/estoque/transferencias">Solicitações de transferência <span>{transfers}</span></Link><Link href="/atualizacoes">Central de atualizações</Link></div>}</div>
        <div className="modern-tool-wrap"><button type="button" className="modern-avatar" aria-label="Menu do usuário" aria-expanded={popover === "user"} onClick={() => setPopover(popover === "user" ? null : "user")}>{initials}</button>{popover === "user" && <div className="modern-popover"><strong>{auth.nomeUsuario ?? "Usuário"}</strong><span className="modern-user-email">{auth.emailUsuario}</span><button type="button" onClick={onApp}><Icon name="phone" />App Campo</button><Link href="/alterar-senha">Alterar senha</Link>{auth.userRole === "bpo" && <Link href="/bpo/admin">Administração BPO</Link>}{["raccotlo", "raccotlo_gestor", "raccotlo_seletor"].includes(auth.userRole ?? "") && auth.raccotloGestor && <Link href="/admin">Administração</Link>}{auth.userRole === "raccotlo" && <Link href="/raccotlo">Raccotlo</Link>}<Link href="/suporte">Suporte</Link><button type="button" onClick={auth.signOut}>Sair</button></div>}</div>
      </div>
    </header>
    {activeGroup && <div className="modern-breadcrumb" aria-label="Localização"><span>{activeGroup.label}</span><span aria-hidden="true">/</span><strong>{active?.label}</strong></div>}
  </>;
}
