"use client";

import { useEffect, useState } from "react";
import { FiMonitor, FiMoon, FiSun } from "react-icons/fi";

export type ThemeMode = "light" | "dark" | "system";

export function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const saved = localStorage.getItem("theme-mode") as ThemeMode | null;
  if (saved && ["light", "dark", "system"].includes(saved)) {
    return saved;
  }
  return "system";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = mode === "dark" || (mode === "system" && systemIsDark);

  if (isDark) {
    root.setAttribute("data-theme", "dark");
    root.classList.add("dark");
  } else {
    root.setAttribute("data-theme", "light");
    root.classList.remove("dark");
  }
  root.setAttribute("data-theme-mode", mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = getInitialTheme();
    setMode(saved);
    applyTheme(saved);
    setMounted(true);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const currentMode = (localStorage.getItem("theme-mode") as ThemeMode) || "system";
      if (currentMode === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const cycleTheme = () => {
    const nextMode: ThemeMode =
      mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    setMode(nextMode);
    localStorage.setItem("theme-mode", nextMode);
    applyTheme(nextMode);
  };

  const Icon = !mounted || mode === "system" ? FiMonitor : mode === "dark" ? FiMoon : FiSun;
  const labelText = mode === "light" ? "Light Mode" : mode === "dark" ? "Dark Mode" : "System Default";

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={cycleTheme}
      aria-label={`Theme mode: ${labelText}. Click to switch theme.`}
      title={`Theme: ${labelText} (click to switch)`}
    >
      <Icon aria-hidden="true" className="theme-toggle-icon" />
    </button>
  );
}
