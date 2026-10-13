export interface ThemeColors { page: string; surface: string; input: string; hover: string; text: string; secondary: string; muted: string; border: string; control: string; primary: string; onPrimary: string; accent: string; }
export interface Palette { name: string; description: string; nav: string; nav2: string; light: ThemeColors; dark: ThemeColors; }
export const PALETTES = {
  "default": {
    "name": "Arato",
    "description": "Azul petróleo com dourado.",
    "nav": "#0A1628",
    "light": {
      "page": "#F3F6FA",
      "surface": "#FFFFFF",
      "input": "#FFFFFF",
      "hover": "#EDF2F8",
      "text": "#15263C",
      "secondary": "#43566D",
      "muted": "#5B6B83",
      "border": "#D9E2EE",
      "control": "#78889B",
      "primary": "#1A4870",
      "onPrimary": "#FFFFFF",
      "accent": "#95670C"
    },
    "dark": {
      "page": "#0C1421",
      "surface": "#142033",
      "input": "#19283D",
      "hover": "#1B2B43",
      "text": "#F1F5FA",
      "secondary": "#BFCDDE",
      "muted": "#9CAFC6",
      "border": "#324760",
      "control": "#7E95B1",
      "primary": "#79B5ED",
      "onPrimary": "#071827",
      "accent": "#E8B657"
    },
    "nav2": "#1A4870"
  },
  "pitch": {
    "name": "Pitch",
    "description": "Monocromático, com tons de grafite.",
    "nav": "#18181B",
    "nav2": "#27272A",
    "light": {
      "page": "#FAFAFA",
      "surface": "#FFFFFF",
      "input": "#FFFFFF",
      "hover": "#F4F4F5",
      "text": "#09090B",
      "secondary": "#52525B",
      "muted": "#65656F",
      "border": "#E4E4E6",
      "control": "#85858F",
      "primary": "#27272A",
      "onPrimary": "#FFFFFF",
      "accent": "#6B5A20"
    },
    "dark": {
      "page": "#101114",
      "surface": "#1C1E23",
      "input": "#24262D",
      "hover": "#2C2E35",
      "text": "#F4F4F5",
      "secondary": "#CACAD2",
      "muted": "#AAAAB5",
      "border": "#3B3E48",
      "control": "#8E909C",
      "primary": "#D4D4DD",
      "onPrimary": "#131318",
      "accent": "#E8B657"
    }
  },
  "terra": {
    "name": "Terra",
    "description": "Tons terrosos quentes.",
    "nav": "#1C1512",
    "nav2": "#2B1D16",
    "light": {
      "page": "#FAF9F6",
      "surface": "#FFFFFF",
      "input": "#FFFFFF",
      "hover": "#F0EAE0",
      "text": "#1A1410",
      "secondary": "#5E5048",
      "muted": "#7B6556",
      "border": "#E4DACE",
      "control": "#998373",
      "primary": "#8B6014",
      "onPrimary": "#FFFFFF",
      "accent": "#875C14"
    },
    "dark": {
      "page": "#1C1410",
      "surface": "#2E2119",
      "input": "#382820",
      "hover": "#402E22",
      "text": "#FFF3E9",
      "secondary": "#D6C1B2",
      "muted": "#BCA492",
      "border": "#604735",
      "control": "#B18B6F",
      "primary": "#E8B466",
      "onPrimary": "#27180B",
      "accent": "#EAC477"
    }
  },
  "alto": {
    "name": "Alto",
    "description": "Azul meia-noite.",
    "nav": "#1B2235",
    "nav2": "#243252",
    "light": {
      "page": "#F5F7F9",
      "surface": "#FFFFFF",
      "input": "#FFFFFF",
      "hover": "#ECF0F5",
      "text": "#0F172A",
      "secondary": "#475569",
      "muted": "#5D6D86",
      "border": "#D8DEE8",
      "control": "#78889B",
      "primary": "#1B2235",
      "onPrimary": "#FFFFFF",
      "accent": "#95670C"
    },
    "dark": {
      "page": "#101626",
      "surface": "#1B263C",
      "input": "#22304A",
      "hover": "#29364E",
      "text": "#F0F4FC",
      "secondary": "#C2CDDF",
      "muted": "#A3B4CE",
      "border": "#3E5070",
      "control": "#869ABE",
      "primary": "#A2B9F0",
      "onPrimary": "#0C1830",
      "accent": "#E8B657"
    }
  },
  "campo": {
    "name": "Campo",
    "description": "Verde oliva.",
    "nav": "#14201A",
    "nav2": "#1D3325",
    "light": {
      "page": "#F5F8F2",
      "surface": "#FFFFFF",
      "input": "#FFFFFF",
      "hover": "#EAF0E4",
      "text": "#0D1A10",
      "secondary": "#3B5444",
      "muted": "#566F54",
      "border": "#D4E0CB",
      "control": "#768B7D",
      "primary": "#1D3325",
      "onPrimary": "#FFFFFF",
      "accent": "#856010"
    },
    "dark": {
      "page": "#101A14",
      "surface": "#1D2A20",
      "input": "#26372A",
      "hover": "#2F4232",
      "text": "#F0F5EB",
      "secondary": "#CDD8C5",
      "muted": "#ADC0A4",
      "border": "#475D40",
      "control": "#91AA84",
      "primary": "#BED69F",
      "onPrimary": "#182410",
      "accent": "#E3BC6E"
    }
  },
  "safra": {
    "name": "Safra",
    "description": "Verde contemporâneo.",
    "nav": "#10251C",
    "light": {
      "page": "#F1F6F2",
      "surface": "#FFFFFF",
      "input": "#FFFFFF",
      "hover": "#EAF2EC",
      "text": "#163025",
      "secondary": "#405D4D",
      "muted": "#566F60",
      "border": "#D8E5DC",
      "control": "#768B7D",
      "primary": "#20603F",
      "onPrimary": "#FFFFFF",
      "accent": "#856010"
    },
    "dark": {
      "page": "#0D1913",
      "surface": "#15261D",
      "input": "#1B3024",
      "hover": "#20382A",
      "text": "#EEF7F0",
      "secondary": "#BDCEC1",
      "muted": "#9CB3A3",
      "border": "#334D3D",
      "control": "#799984",
      "primary": "#7BCB94",
      "onPrimary": "#0B2113",
      "accent": "#E3BC6E"
    },
    "nav2": "#20603F"
  },
  "horizonte": {
    "name": "Horizonte",
    "description": "Azul aberto.",
    "nav": "#10233A",
    "light": {
      "page": "#F1F5FB",
      "surface": "#FFFFFF",
      "input": "#FFFFFF",
      "hover": "#EAF1FC",
      "text": "#162A43",
      "secondary": "#415C77",
      "muted": "#546A82",
      "border": "#D8E3F0",
      "control": "#778CA4",
      "primary": "#155FA0",
      "onPrimary": "#FFFFFF",
      "accent": "#916811"
    },
    "dark": {
      "page": "#0B1524",
      "surface": "#14243A",
      "input": "#192E47",
      "hover": "#203650",
      "text": "#F0F6FF",
      "secondary": "#BCCEE4",
      "muted": "#9EB5D0",
      "border": "#334F6D",
      "control": "#809DBC",
      "primary": "#78B9FB",
      "onPrimary": "#081D34",
      "accent": "#EFC46B"
    },
    "nav2": "#155FA0"
  },
  "areia": {
    "name": "Areia",
    "description": "Neutros quentes e bronze.",
    "nav": "#30251B",
    "light": {
      "page": "#F8F5EE",
      "surface": "#FFFDF8",
      "input": "#FFFDF8",
      "hover": "#F1EBE0",
      "text": "#322A21",
      "secondary": "#615342",
      "muted": "#74634F",
      "border": "#E5DCCF",
      "control": "#93816A",
      "primary": "#775231",
      "onPrimary": "#FFFFFF",
      "accent": "#875C14"
    },
    "dark": {
      "page": "#181612",
      "surface": "#252119",
      "input": "#302A20",
      "hover": "#393125",
      "text": "#FAF5EB",
      "secondary": "#D3C8B8",
      "muted": "#B6A795",
      "border": "#514636",
      "control": "#AB977A",
      "primary": "#DABA87",
      "onPrimary": "#241C10",
      "accent": "#EAC477"
    },
    "nav2": "#775231"
  }
} satisfies Record<string, Palette>;
export type PaletteId = keyof typeof PALETTES;
export type AppearanceMode = "light" | "dark" | "system";
export type ResolvedMode = "light" | "dark";

export const MODES: { id: AppearanceMode; label: string }[] = [
  { id: "light", label: "Claro" }, { id: "dark", label: "Escuro" }, { id: "system", label: "Automático" },
];

export function validPalette(value: unknown): PaletteId {
  return typeof value === "string" && Object.hasOwn(PALETTES, value) ? value as PaletteId : "default";
}

export function validMode(value: unknown): AppearanceMode {
  return value === "dark" || value === "system" ? value : "light";
}

export function resolveMode(mode: AppearanceMode, prefersDark: boolean): ResolvedMode {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

export function themeVariables(palette: PaletteId, mode: ResolvedMode): Record<string, string> {
  const p = PALETTES[palette], c = p[mode];
  const semantic = mode === "dark"
    ? { successText: "#9ADDAD", successBg: "#1D382B", warningText: "#F0C875", warningBg: "#3D321F", dangerText: "#FFADB2", dangerBg: "#42232E", infoText: "#A5CCFA", infoBg: "#1D334D", violetText: "#D6BAF8", violetBg: "#342543" }
    : { successText: "#21613E", successBg: "#EAF4EC", warningText: "#825500", warningBg: "#FFF5DC", dangerText: "#A52732", dangerBg: "#FDEEF0", infoText: "#1A4870", infoBg: "#E8F1FA", violetText: "#68408B", violetBg: "#F0EAFB" };
  return {
    "--bg-page": c.page, "--bg-card": c.surface, "--bg-header": c.surface, "--bg-nav": c.page,
    "--bg-input": c.input, "--bg-input-f": c.input, "--bg-hover": c.hover, "--bg-stripe": c.hover, "--bg-tag": c.hover,
    "--border": c.border, "--border-table": c.border, "--border-row": c.border, "--border-control": c.control,
    "--text-1": c.text, "--text-2": c.secondary, "--text-3": c.muted, "--text-muted": c.muted,
    "--nav-bg": p.nav, "--nav-faixa1": p.nav, "--nav-faixa2": p.nav2, "--nav-text": "#FFFFFF",
    "--c-primary": c.primary, "--c-primary-light": c.hover, "--on-primary": c.onPrimary, "--c-accent": c.accent,
    "--status-success-text": semantic.successText, "--status-success-bg": semantic.successBg,
    "--status-warning-text": semantic.warningText, "--status-warning-bg": semantic.warningBg,
    "--status-danger-text": semantic.dangerText, "--status-danger-bg": semantic.dangerBg,
    "--status-info-text": semantic.infoText, "--status-info-bg": semantic.infoBg,
    "--status-violet-text": semantic.violetText, "--status-violet-bg": semantic.violetBg,
    "--shadow-card": mode === "dark" ? "0 1px 6px rgba(0,0,0,0.3)" : "0 1px 4px rgba(11,45,80,0.05)",
    "--shadow-modal": mode === "dark" ? "0 8px 40px rgba(0,0,0,0.6)" : "0 4px 20px rgba(11,45,80,0.10)",
    "--overlay": mode === "dark" ? "rgba(0,0,0,0.65)" : "rgba(11,45,80,0.35)",
  };
}

/** Aplica a preferência antes da primeira pintura, mesmo se o armazenamento estiver bloqueado. */
export const APPEARANCE_SCRIPT = `(${function bootstrap(palettes: typeof PALETTES, variables: Record<PaletteId, Record<ResolvedMode, Record<string, string>>>) {
  let palette = "default", mode = "light";
  try {
    palette = localStorage.getItem("arato-palette") || palette;
    mode = localStorage.getItem("arato-theme") || mode;
  } catch { /* Navegação privada pode bloquear localStorage. */ }
  if (!Object.hasOwn(palettes, palette)) palette = "default";
  if (!["light", "dark", "system"].includes(mode)) mode = "light";
  const resolved = mode === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
  const root = document.documentElement;
  root.dataset.palette = palette;
  root.dataset.appearance = mode;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  for (const [name, value] of Object.entries(variables[palette as PaletteId][resolved as ResolvedMode])) root.style.setProperty(name, value);
}.toString()})(${JSON.stringify(PALETTES)},${JSON.stringify(Object.fromEntries(Object.keys(PALETTES).map(id => [id, { light: themeVariables(id as PaletteId, "light"), dark: themeVariables(id as PaletteId, "dark") }])))});`;
