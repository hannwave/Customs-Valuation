"use client";

import { useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";

export type ThemeMode = "light" | "dark" | "system";

export function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const remainingMode: ThemeMode = systemIsDark ? "light" : "dark";
  const saved = localStorage.getItem("theme-mode") as ThemeMode | null;
  if (saved === remainingMode) {
    return remainingMode;
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
    root.setAttribute("data-mantine-color-scheme", "dark");
  } else {
    root.setAttribute("data-theme", "light");
    root.classList.remove("dark");
    root.setAttribute("data-mantine-color-scheme", "light");
  }
  root.setAttribute("data-theme-mode", mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [systemIsDark, setSystemIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const isDark = mediaQuery.matches;
    setSystemIsDark(isDark);

    const saved = getInitialTheme();
    setMode(saved);
    applyTheme(saved);
    setMounted(true);

    // Print preview briefly reports a light colour scheme. Ignore changes while printing, and never overwrite the
    // saved choice on a system change: re-read it instead, so cancelling a print leaves the theme as it was.
    let printing = false;
    const beforePrint = () => { printing = true; };
    const afterPrint = () => {
      printing = false;
      setSystemIsDark(mediaQuery.matches);
      const restored = getInitialTheme(); setMode(restored); applyTheme(restored);
    };
    const handleChange = (e: MediaQueryListEvent) => {
      if (printing) return;
      setSystemIsDark(e.matches);
      const next = getInitialTheme();
      setMode(next);
      applyTheme(next);
    };

    mediaQuery.addEventListener("change", handleChange);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  const remainingMode: ThemeMode = systemIsDark ? "light" : "dark";

  const toggleTheme = () => {
    // Only 2 choices: the default of the computer ("system") and the remaining mode
    const nextMode: ThemeMode = mode === "system" ? remainingMode : "system";
    setMode(nextMode);
    localStorage.setItem("theme-mode", nextMode);
    applyTheme(nextMode);
  };

  const isCurrentDark = mode === "dark" || (mode === "system" && systemIsDark);
  const Icon = mounted && isCurrentDark ? FiMoon : FiSun;
  const currentLabel =
    mode === "system"
      ? `Computer Default (${systemIsDark ? "Dark" : "Light"})`
      : mode === "dark"
      ? "Dark Mode"
      : "Light Mode";
  const nextLabel =
    mode === "system"
      ? (remainingMode === "dark" ? "Dark Mode" : "Light Mode")
      : `Computer Default (${systemIsDark ? "Dark" : "Light"})`;

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label={`Theme: ${currentLabel}. Click to switch to ${nextLabel}.`}
      title={`Theme: ${currentLabel} (click to switch to ${nextLabel})`}
    >
      <Icon aria-hidden="true" className="theme-toggle-icon" />
    </button>
  );
}
