"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";

interface ThemeSwitcherProps {
  className?: string;
  align?: "left" | "right";
}

export function ThemeSwitcher({ className = "" }: ThemeSwitcherProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch between server HTML and client localStorage
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        aria-label="Toggle theme"
        className={`flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle bg-surface text-text-muted transition-all shadow-2xs ${className}`}
      >
        <span className="h-4 w-4" />
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle bg-surface hover:bg-surface-subtle active:scale-95 transition-all shadow-2xs cursor-pointer ${className}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 group-hover:rotate-45 transition-transform duration-200" />
      ) : (
        <Moon className="h-4 w-4 text-slate-700 group-hover:-rotate-12 transition-transform duration-200" />
      )}
    </button>
  );
}
