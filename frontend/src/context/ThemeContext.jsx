import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * cdxi | OS — Multi-theme system
 *
 * Each theme has its own background, accent palette, ambient glow,
 * and personality. Themes are applied via `data-theme=...` on <html>,
 * with all visual tokens defined in App.css.
 */

export const THEMES = [
  {
    id: "dark",
    name: "Cinematic Dark",
    description: "Indigo + violet, deep cinema",
    color: "#6366f1",
    accent: "linear-gradient(135deg, #6366f1, #a78bfa)",
  },
  {
    id: "light",
    name: "Studio Light",
    description: "Clean paper, sharp focus",
    color: "#4338ca",
    accent: "linear-gradient(135deg, #4338ca, #6366f1)",
  },
  {
    id: "midnight",
    name: "Midnight Ocean",
    description: "Deep navy + cyan tides",
    color: "#06b6d4",
    accent: "linear-gradient(135deg, #0891b2, #06b6d4)",
  },
  {
    id: "sunset",
    name: "Sunset Amber",
    description: "Warm dusk, rose + gold",
    color: "#fb923c",
    accent: "linear-gradient(135deg, #fb923c, #f43f5e)",
  },
  {
    id: "forest",
    name: "Forest Quiet",
    description: "Emerald moss + birch",
    color: "#10b981",
    accent: "linear-gradient(135deg, #10b981, #14b8a6)",
  },
  {
    id: "mono",
    name: "Editorial Mono",
    description: "Pure greyscale precision",
    color: "#71717a",
    accent: "linear-gradient(135deg, #18181b, #71717a)",
  },
];

const ThemeContext = createContext({ theme: "dark", setTheme: () => {}, themes: THEMES });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem("cdxi-theme");
    if (saved && THEMES.find((t) => t.id === saved)) return saved;
    return "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cdxi-theme", theme);
  }, [theme]);

  const setTheme = (id) => {
    if (THEMES.find((t) => t.id === id)) setThemeState(id);
  };

  // Backward-compat: keep toggle for code that still calls it (dark <-> light)
  const toggle = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
