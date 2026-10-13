"use client";
import { useLayout } from "./LayoutProvider";
export default function LayoutSettings({ density = false }: { density?: boolean }) {
  const layout = useLayout();
  return <div className="layout-settings">
    <div className="layout-choice" role="group" aria-label="Modelo de layout">
      <span>Layout</span>
      <button type="button" aria-pressed={!layout.modern} onClick={() => layout.setMode("current")}>Atual</button>
      <button type="button" aria-pressed={layout.modern} onClick={() => layout.setMode("new")}>Novo</button>
    </div>
    {density && layout.modern && <div className="layout-choice" role="group" aria-label="Densidade dos grids">
      <span>Grid</span>
      <button type="button" aria-pressed={layout.density === "comfortable"} onClick={() => layout.setDensity("comfortable")}>Confortável</button>
      <button type="button" aria-pressed={layout.density === "compact"} onClick={() => layout.setDensity("compact")}>Compacto</button>
    </div>}
  </div>;
}
