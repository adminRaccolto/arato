"use client";
import { useGridDensity } from "./GridDensityProvider";

export default function GridDensitySettings() {
  const { density, setDensity } = useGridDensity();
  return <div className="grid-density-settings">
    <div className="grid-density-choice" role="group" aria-label="Densidade dos grids">
      <button type="button" aria-pressed={density === "comfortable"} onClick={() => setDensity("comfortable")}>Confortável</button>
      <button type="button" aria-pressed={density === "compact"} onClick={() => setDensity("compact")}>Compacto</button>
    </div>
  </div>;
}
