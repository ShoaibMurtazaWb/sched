"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomSelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  id?: string;
  value: string | number;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
  className,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  // Click outside listener
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

  // Keyboard navigation listener
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-xs text-text-main shadow-2xs transition-all cursor-pointer outline-none",
          isOpen ? "ring-2 ring-brand/40 border-brand" : "hover:border-brand/40",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={cn("truncate font-medium", !selectedOption && "text-text-muted")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-200",
            isOpen && "rotate-180 text-brand"
          )}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-border-subtle bg-surface p-1.5 shadow-xl animate-in fade-in-0 slide-in-from-top-1 duration-150"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted">No options available</div>
          ) : (
            options.map((option) => {
              const isSelected = String(option.value) === String(value);
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange(String(option.value));
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer",
                    isSelected
                      ? "bg-blue-50 text-brand font-semibold dark:bg-blue-950/50"
                      : "text-text-main hover:bg-blue-50/70 hover:text-brand dark:hover:bg-blue-950/30",
                    option.disabled && "opacity-50 cursor-not-allowed pointer-events-none"
                  )}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="truncate">{option.label}</span>
                    {option.sublabel && (
                      <span className="text-[11px] text-text-muted font-normal truncate">
                        {option.sublabel}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-brand stroke-[2.5]" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
