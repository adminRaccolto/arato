"use client";
import { PALETTES, MODES, type PaletteId } from "../lib/appearance";
import LayoutSettings from "./LayoutSettings";
import { useAppearance } from "./AppearanceProvider";

export default function AppearanceSettings({ compact = false }: { compact?: boolean }) {
  const { palette, mode, dark, setPalette, setMode } = useAppearance();
  return (
    <section className={`appearance-settings${compact ? " appearance-compact" : ""}`} aria-label="Aparência do sistema">
      {!compact && <><h2>Tema de cores</h2><p className="appearance-description">Escolha uma paleta e o modo de exibição. A preferência fica salva neste navegador.</p></>}
      <div className="appearance-mode" role="group" aria-label="Modo de exibição">
        {MODES.map(item => <button type="button" key={item.id} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>)}
      </div>
      {!compact && <p className="appearance-description">{mode === "system" ? "Automático acompanha a preferência claro ou escuro do dispositivo." : "Fundos, letras, campos e mensagens acompanham o modo escolhido."}</p>}
      <div className="appearance-palettes" role="group" aria-label="Paleta de cores">
        {(Object.entries(PALETTES) as [PaletteId, typeof PALETTES[PaletteId]][]).map(([id, p]) => {
          const c = p[dark ? "dark" : "light"];
          return <button type="button" key={id} aria-pressed={palette === id} aria-label={`Paleta ${p.name}`} onClick={() => setPalette(id)} className="appearance-palette">
            <div data-theme-static="true" className="appearance-preview" style={{ background: c.page }}>
              <div style={{ background: p.nav, height: compact ? 10 : 14 }} />
              <div style={{ background: p.nav2, height: compact ? 7 : 9 }} />
              {!compact && <div style={{ padding: 8 }}><div style={{ background: c.surface, padding: 7, borderRadius: 4 }}><div style={{ height: 3, width: "65%", background: c.text, marginBottom: 4 }} /><div style={{ height: 3, width: "85%", background: c.muted }} /></div></div>}
            </div>
            <span className="appearance-palette-label"><strong>{p.name}</strong>{palette === id && <span aria-hidden="true">✓</span>}</span>
            {!compact && <span className="appearance-palette-description">{p.description}</span>}
          </button>;
        })}
      </div>
      <details className="layout-disclosure"><summary>Modelo de layout e densidade</summary><LayoutSettings density /></details>
    </section>
  );
}
