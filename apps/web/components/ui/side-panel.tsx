"use client";

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useScrollLock } from "@/lib/use-scroll-lock";

export interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerContent?: React.ReactNode;
  customHeader?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
}

export function SidePanel({
  isOpen,
  onClose,
  title,
  subtitle,
  headerContent,
  customHeader,
  headerActions,
  children,
  footer,
  width,
  className = "",
  bodyClassName = "",
  ariaLabel,
}: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile/tablet vs desktop (breakpoint at lg: 1024px)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const updateMatches = () => setIsMobile(media.matches);
    updateMatches();
    media.addEventListener("change", updateMatches);
    return () => media.removeEventListener("change", updateMatches);
  }, []);

  // Lock body scroll ONLY on mobile/tablet when panel is open.
  // Desktop acts as a real interactive application workspace without locking main page scroll.
  useScrollLock(isOpen && isMobile);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Width configuration:
  // Desktop default width is 390px (compact/balanced), scaling to 420px on xl+.
  // Max width is constrained so it never exceeds available viewport.
  const desktopWidthClass = width && width.includes("w-")
    ? width
    : "lg:w-[390px] xl:w-[420px]";

  const customWidthStyle = width && !width.includes("w-")
    ? { width }
    : undefined;

  return (
    <>
      {/* Mobile/Tablet Backdrop: Smooth fade-in, completely hidden on Desktop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 bg-black/50 backdrop-blur-xs z-40 transition-opacity duration-300 ease-in-out lg:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Side Panel:
          - Mobile/Tablet (< 1024px): Fixed slide-over overlay with translate-x animation
          - Desktop (>= 1024px): In-flow flex sibling anchored right with animated width
      */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={isMobile}
        aria-label={typeof title === "string" ? title : ariaLabel || "Side Panel"}
        style={isOpen ? customWidthStyle : undefined}
        className={`
          /* Mobile & Tablet Styles: Full slide-over drawer */
          fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:max-w-md bg-surface border-l border-border-subtle shadow-2xl transition-[transform,opacity] duration-300 ease-in-out will-change-transform
          ${isOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}

          /* Desktop Responsive In-Flow Styles: Part of layout, never clipped */
          lg:static lg:inset-auto lg:top-0 lg:right-auto lg:z-10 lg:shadow-none lg:translate-x-0 lg:opacity-100 lg:h-[calc(100vh-5rem)] lg:sticky lg:top-20 lg:shrink-0 lg:transition-[width,border-color] lg:duration-300 lg:ease-in-out
          ${
            isOpen
              ? `${desktopWidthClass} lg:max-w-[45vw] lg:border-l lg:border-border-subtle lg:pointer-events-auto`
              : "lg:w-0 lg:border-l-0 lg:pointer-events-none lg:overflow-hidden"
          }
          ${className}
        `}
      >
        {/* Inner container with stable fixed width so internal form/text content doesn't squeeze during 300ms transition */}
        <div
          style={customWidthStyle}
          className={`w-full ${desktopWidthClass} lg:w-[390px] xl:w-[420px] h-full flex flex-col overflow-hidden bg-surface`}
        >
          {/* Header Slot: customHeader OR standard title, subtitle, custom actions, and close button */}
          {customHeader ? (
            <div className="border-b border-border-subtle bg-surface sticky top-0 z-10 shrink-0">
              {customHeader}
            </div>
          ) : (title || headerContent || headerActions) ? (
            <div className="border-b border-border-subtle bg-surface sticky top-0 z-10 shrink-0">
              <div className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0 flex-1 pr-3">
                  {typeof title === "string" ? (
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted truncate">
                      {title}
                    </h2>
                  ) : (
                    title
                  )}
                  {subtitle && (
                    <p className="text-xs text-text-sub mt-0.5 truncate font-normal">
                      {subtitle}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {headerActions}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close panel"
                    title="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:text-text-main hover:bg-surface-subtle active:scale-95 transition-all cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {headerContent && (
                <div className="px-5 pb-3">
                  {headerContent}
                </div>
              )}
            </div>
          ) : null}

          {/* Fallback close button if no header is provided */}
          {!customHeader && !title && !headerContent && !headerActions && (
            <div className="absolute top-3.5 right-3.5 z-20">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                title="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-sub hover:text-text-main hover:bg-surface-subtle active:scale-95 transition-all cursor-pointer bg-surface/90 backdrop-blur-xs border border-border-subtle shadow-xs"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Isolated Body Scroll Container:
              - overscroll-contain prevents scroll chaining to parent page
              - overflow-y-auto ensures smooth independent scrolling for long forms
          */}
          <div
            className={`flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4 ${bodyClassName}`}
          >
            {children}
          </div>

          {/* Sticky Footer Slot */}
          {footer && (
            <div className="px-5 py-3.5 border-t border-border-subtle bg-surface sticky bottom-0 z-10 flex items-center justify-between gap-3 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
