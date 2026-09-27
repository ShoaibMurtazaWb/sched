"use client";

import React, { useEffect, useRef, useState } from "react";
import { Sun, Moon, Laptop, Check } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme-provider";

interface ThemeSwitcherProps {
  className?: string;
  align?: "left" | "right";
}

export function ThemeSwitcher({ className = "", align = "right" }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: "light",
      label: "Light",
      icon: <Sun className="h-4 w-4" />,
    },
    {
      value: "dark",
      label: "Dark",
      icon: <Moon className="h-4 w-4" />,
    },
    {
      value: "system",
      label: "System",
      icon: <Laptop className="h-4 w-4" />,
    },
  ];

  // Render current icon based on theme (or resolvedTheme when system)
  const currentIcon = () => {
    if (!mounted) {
      // Placeholder while hydrating
      return <Sun className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />;
    }
    if (theme === "system") {
      return <Laptop className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />;
    }
    if (theme === "dark") {
      return <Moon className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />;
    }
    return <Sun className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />;
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Toggle theme (Light, Dark, or System)"
        title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 transition-all shadow-2xs cursor-pointer dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-white"
      >
        {currentIcon()}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } mt-2 w-36 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150 dark:border-neutral-800 dark:bg-neutral-900`}
        >
          <div className="px-2 py-1 text-[10px] font-bold tracking-wider uppercase text-neutral-400 dark:text-neutral-500">
            Theme
          </div>
          {options.map((option) => {
            const isSelected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold"
                    : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`transition-colors ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    {option.icon}
                  </span>
                  <span>{option.label}</span>
                </div>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
