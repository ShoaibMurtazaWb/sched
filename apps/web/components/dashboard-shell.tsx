"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Link2,
  Clock,
  Puzzle,
  BarChart3,
  Plus,
  LogOut,
  ExternalLink,
  ChevronDown,
  Globe,
  User as UserIcon,
  Settings,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { api, type CurrentUser } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { useScrollLock } from "@/lib/use-scroll-lock";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileDropdownOpen, setIsMobileDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Persisted collapsible sidebar state
  const [isCollapsed, setIsCollapsed] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  // Load sidebar preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sched_sidebar_collapsed");
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sched_sidebar_collapsed", String(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  };

  // Close mobile sidebar and dropdowns on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMobileDropdownOpen(false);
    setIsDropdownOpen(false);
  }, [pathname]);

  // Prevent background page scrolling while the mobile drawer is open
  useScrollLock(isMobileMenuOpen);

  // Touch/swipe-to-close handlers for mobile drawer
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const firstTouch = e.touches[0];
    if (firstTouch) {
      setTouchStartX(firstTouch.clientX);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const firstTouch = e.touches[0];
    if (touchStartX === null || !firstTouch) return;
    const currentX = firstTouch.clientX;
    const diff = currentX - touchStartX;
    if (diff < -50) {
      setIsMobileMenuOpen(false);
      setTouchStartX(null);
    }
  };

  const handleTouchEnd = () => {
    setTouchStartX(null);
  };

  // Click-outside listener to close user menu dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(event.target as Node)) {
        setIsMobileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Escape key listener to close mobile drawer and dropdowns
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isMobileMenuOpen) setIsMobileMenuOpen(false);
        if (isDropdownOpen) setIsDropdownOpen(false);
        if (isMobileDropdownOpen) setIsMobileDropdownOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen, isDropdownOpen, isMobileDropdownOpen]);

  async function checkAuth() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const currentUser = await api<CurrentUser>("/auth/me");
      setUser(currentUser);
    } catch (error: unknown) {
      const isUnauthorized =
        (error instanceof ApiError && (error.status === 401 || error.status === 403)) ||
        (typeof error === "object" && error !== null && "status" in error && (error as { status: number }).status === 401) ||
        (error instanceof Error && (error.message.includes("401") || error.message.includes("Unauthorized") || error.message.includes("Authentication required")));

      if (isUnauthorized) {
        const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/dashboard";
        window.location.replace(`/login?redirectTo=${encodeURIComponent(currentPath)}`);
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to scheduling API (port 3001). Please ensure both web and API services are running."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void checkAuth();
  }, []);

  // Listen for real-time profile updates from settings
  useEffect(() => {
    function handleUserUpdated(event: CustomEvent<Partial<CurrentUser>>) {
      if (event.detail) {
        setUser((prev) => (prev ? { ...prev, ...event.detail } : prev));
      }
    }
    window.addEventListener("sched_user_updated" as string, handleUserUpdated as EventListener);
    return () => {
      window.removeEventListener("sched_user_updated" as string, handleUserUpdated as EventListener);
    };
  }, []);

  // Minute-level clock updates
  useEffect(() => {
    if (!user?.timezone) return;

    function updateTime() {
      try {
        const formatter = new Intl.DateTimeFormat("en-GB", {
          timeZone: user?.timezone,
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        });
        setCurrentTime(formatter.format(new Date()));
      } catch {
        setCurrentTime("");
      }
    }

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [user?.timezone]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.replace("/");
  }

  // Navigation Items matching Calendly's exact taxonomy
  const mainNavItems = useMemo(
    () => [
      {
        label: "Scheduling",
        href: "/dashboard",
        active: pathname === "/dashboard" || pathname.startsWith("/dashboard/event-types"),
        icon: Link2,
      },
      {
        label: "Meetings",
        href: "/dashboard/bookings",
        active: pathname.startsWith("/dashboard/bookings"),
        icon: Calendar,
      },
      {
        label: "Availability",
        href: "/dashboard/availability",
        active: pathname.startsWith("/dashboard/availability"),
        icon: Clock,
      },
      {
        label: "Integrations & apps",
        href: "/dashboard/integrations",
        active: pathname.startsWith("/dashboard/integrations"),
        icon: Puzzle,
      },
    ],
    [pathname]
  );

  const secondaryNavItems = useMemo(
    () => [
      {
        label: "Analytics",
        href: "/dashboard/analytics",
        active: pathname.startsWith("/dashboard/analytics"),
        icon: BarChart3,
      },
      {
        label: "Settings",
        href: "/dashboard/settings",
        active: pathname.startsWith("/dashboard/settings"),
        icon: Settings,
      },
    ],
    [pathname]
  );

  const allNavItems = useMemo(
    () => [...mainNavItems, ...secondaryNavItems],
    [mainNavItems, secondaryNavItems]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)]">
        <div className="flex flex-col items-center gap-3 text-sm text-[var(--text-secondary)] font-medium">
          <Spinner size="default" />
          <span>Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (errorMessage && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] p-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--status-danger-border)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] mb-4">
            <span className="font-mono text-lg font-bold">!</span>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">API Connection Issue</h2>
          <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">{errorMessage}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <Button type="button" onClick={() => void checkAuth()} size="sm">
              Retry Connection
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Go to Login</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)]">
        <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)] font-medium">
          <Spinner size="default" />
          <span>Redirecting to login…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Mobile Navigation Drawer Sheet (Sched Mobile Sidebar) */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
          isMobileMenuOpen ? "pointer-events-auto visible" : "pointer-events-none invisible"
        }`}
        aria-modal="true"
        role="dialog"
      >
        {/* Backdrop with Smooth Fade Animation */}
        <div
          className={`fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300 ease-in-out ${
            isMobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Close navigation menu"
        />

        {/* Drawer Panel with Slide-in / Slide-out Animation (300ms ease-in-out) */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] max-w-[85vw] bg-surface border-r border-border-subtle shadow-2xl transition-transform duration-300 ease-in-out will-change-transform ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Drawer Top Header: Sched Brand & Close Button */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
            <Link
              href="/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2.5"
            >
              <Logo className="h-7 w-7 shrink-0" />
              <span className="font-bold tracking-tight text-text-main text-lg">Sched</span>
            </Link>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:text-text-main hover:bg-surface-subtle active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* User Identity Mini Card */}
          <div className="px-5 py-3 border-b border-border-subtle bg-surface-subtle/50 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-bold text-sm shadow-2xs select-none overflow-hidden">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-main truncate leading-snug">{user.name}</p>
                <p className="text-xs text-text-muted truncate leading-tight">@{user.username}</p>
              </div>
            </div>
          </div>

          {/* Sched Navigation Items (Scheduling, Meetings, Availability, Integrations & apps, Analytics, Settings) */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-1">
            {allNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                    item.active
                      ? "bg-brand/10 text-brand font-semibold"
                      : "text-text-sub hover:bg-surface-subtle hover:text-text-main"
                  }`}
                >
                  {item.active && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-brand rounded-r-full" />
                  )}
                  <Icon
                    className={`h-5 w-5 shrink-0 transition-colors ${
                      item.active
                        ? "text-brand stroke-[2.2]"
                        : "text-text-muted group-hover:text-text-main stroke-[1.8]"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main App Container */}
      <div className="flex flex-1 min-h-screen md:min-h-0">

        {/* Desktop Sidebar Navigation (Hidden on Mobile) */}
        <aside
          className={`hidden md:flex flex-col justify-between border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[width] duration-500 ease-in-out md:sticky md:top-0 md:h-screen ${
            isCollapsed ? "md:w-[84px]" : "md:w-[260px]"
          }`}
        >
          {/* Floating Expand Button on Right Border (When Collapsed) */}
          {isCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden md:flex absolute -right-4 top-[20px] z-50 h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-md text-neutral-900 hover:bg-neutral-50 hover:scale-110 active:scale-95 transition-all cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <ChevronsRight className="h-4 w-4 stroke-[2.5] text-neutral-800" />
            </button>
          )}

          {/* Top Section: Logo & Toggle Button + Create CTA */}
          <div className={`flex flex-col flex-1 min-h-0 overflow-y-auto ${isCollapsed ? "px-3" : "px-5"} py-5 transition-[padding] duration-500`}>
            {/* Logo Row + Collapse Button */}
            <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} mb-5 px-1 min-h-[36px]`}>
              <Link href="/dashboard" className="flex items-center gap-2.5 group shrink-0">
                <Logo className="h-8 w-8 transition-transform duration-150 group-hover:scale-105 shrink-0" />
                {!isCollapsed && (
                  <span className="font-bold tracking-tight text-black text-2xl whitespace-nowrap overflow-hidden transition-all duration-300">
                    Sched
                  </span>
                )}
              </Link>

              {/* Desktop Collapse Button (When Expanded) */}
              {!isCollapsed && (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="hidden md:flex h-8 w-8 items-center justify-center rounded-full text-black hover:bg-neutral-100 transition-colors cursor-pointer shrink-0"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <ChevronsLeft className="h-4.5 w-4.5 stroke-[2.5]" />
                </button>
              )}
            </div>

            {/* "+ Create" Action Button (Desktop Only) */}
            <div className="mb-5">
              {isCollapsed ? (
                <div className="flex justify-center">
                  <Button
                    asChild
                    size="icon"
                    className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-all cursor-pointer"
                    title="Create Event Type"
                  >
                    <Link href="/dashboard/event-types/new">
                      <Plus className="h-5 w-5 stroke-[2.5]" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <Button
                  asChild
                  className="w-full justify-center gap-2 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xs font-semibold text-sm transition-all cursor-pointer"
                >
                  <Link href="/dashboard/event-types/new">
                    <Plus className="h-4 w-4 stroke-[2.5]" />
                    <span className="whitespace-nowrap">Create</span>
                  </Link>
                </Button>
              )}
            </div>

            {/* Main Navigation List */}
            <nav className="space-y-1">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                if (isCollapsed) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-center transition-all ${
                        item.active
                          ? "bg-brand/10 text-brand font-semibold shadow-2xs"
                          : "text-text-sub hover:bg-surface-subtle hover:text-brand"
                      }`}
                      title={item.label}
                    >
                      <Icon className={`h-5 w-5 mb-1 shrink-0 ${item.active ? "text-brand" : "text-text-muted"}`} />
                      <span className={`text-[10px] leading-tight line-clamp-1 font-semibold ${item.active ? "text-brand font-bold" : "text-text-sub"}`}>
                        {item.label}
                      </span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-[background-color,color] duration-150 ${
                      item.active
                        ? "bg-brand/10 text-brand font-semibold"
                        : "text-text-sub hover:bg-surface-subtle hover:text-brand"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        item.active ? "text-brand" : "text-text-muted"
                      }`}
                    />
                    <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${item.active ? "text-brand font-bold" : "text-text-main"}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Bottom Section: Analytics & Settings */}
          <div className={`mt-auto shrink-0 border-t border-border-subtle ${isCollapsed ? "px-3" : "px-5"} pt-3 pb-4 transition-[padding] duration-500`}>
            <nav className="space-y-1">
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                if (isCollapsed) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-center transition-all ${
                        item.active
                          ? "bg-brand/10 text-brand font-semibold shadow-2xs"
                          : "text-text-sub hover:bg-surface-subtle hover:text-brand"
                      }`}
                      title={item.label}
                    >
                      <Icon className={`h-5 w-5 mb-1 shrink-0 ${item.active ? "text-brand" : "text-text-muted"}`} />
                      <span className={`text-[10px] leading-tight line-clamp-1 font-semibold ${item.active ? "text-brand font-bold" : "text-text-sub"}`}>
                        {item.label}
                      </span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                      item.active
                        ? "bg-brand/10 text-brand font-semibold"
                        : "text-text-sub hover:bg-surface-subtle hover:text-brand"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${item.active ? "text-brand" : "text-text-muted"}`} />
                    <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${item.active ? "text-brand font-bold" : "text-text-main"}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-canvas">
          {/* Mobile Header Bar (< md) - Compact 56px, left hamburger + Sched brand, right theme switcher & avatar */}
          <header className="md:hidden sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border-subtle bg-surface px-4 shadow-2xs shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface text-text-main hover:bg-surface-subtle active:bg-surface-muted transition-colors cursor-pointer"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Link href="/dashboard" className="flex items-center gap-2">
                <Logo className="h-7 w-7 shrink-0" />
                <span className="font-bold tracking-tight text-text-main text-lg">Sched</span>
              </Link>
            </div>

            {/* Mobile Right Actions: Theme Switcher & User Avatar Dropdown */}
            <div className="flex items-center gap-2">
              <ThemeSwitcher align="right" />

              <div className="relative" ref={mobileDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsMobileDropdownOpen((prev) => !prev)}
                  className="flex items-center rounded-full p-0.5 border border-transparent hover:border-border-subtle transition-all cursor-pointer"
                  aria-expanded={isMobileDropdownOpen}
                  aria-label="User account menu"
                >
                  <div className="relative">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white text-xs font-bold select-none shadow-2xs overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                      ) : (
                        user.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-surface" />
                  </div>
                </button>

                {isMobileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border-subtle bg-surface p-2 shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-subtle border border-border-subtle mb-1">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white font-bold text-xs">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                        ) : (
                          user.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-text-main truncate">{user.name}</p>
                        <p className="text-[11px] font-mono text-text-muted truncate">@{user.username}</p>
                      </div>
                    </div>

                    {user.timezone && (
                      <div className="px-2.5 py-1.5 mb-1 flex items-center justify-between text-[11px] font-mono text-text-sub bg-surface-subtle rounded-md">
                        <span className="flex items-center gap-1.5 truncate">
                          <Globe className="h-3 w-3 text-text-muted shrink-0" />
                          <span className="truncate">{user.timezone}</span>
                        </span>
                        {currentTime && (
                          <span className="text-text-main font-semibold tabular-nums shrink-0">{currentTime}</span>
                        )}
                      </div>
                    )}

                    <Link
                      href={`/public/${user.username}`}
                      target="_blank"
                      onClick={() => setIsMobileDropdownOpen(false)}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-text-main hover:bg-surface-subtle transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <UserIcon className="h-3.5 w-3.5 text-text-muted" />
                        <span>Public Profile</span>
                      </div>
                      <ExternalLink className="h-3 w-3 text-text-muted" />
                    </Link>

                    <Link
                      href="/dashboard/settings"
                      onClick={() => setIsMobileDropdownOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-text-main hover:bg-surface-subtle transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5 text-text-muted" />
                      <span>Account Settings</span>
                    </Link>

                    <div className="my-1 border-t border-border-subtle" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileDropdownOpen(false);
                        void logout();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Top Bar with User Profile Dropdown (Full Width, Header with Sched design tokens) */}
          <header className="hidden md:flex h-20 w-full items-center justify-end bg-surface border-b border-border-subtle px-8 sm:px-12 md:px-16 gap-4">
            <ThemeSwitcher align="right" />

            {/* User Profile Dropdown Menu in Top Navbar */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2.5 rounded-full p-1.5 pl-2.5 hover:bg-surface-subtle border border-transparent hover:border-border-subtle transition-all cursor-pointer"
                aria-expanded={isDropdownOpen}
                aria-label="User account menu"
              >
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white text-xs font-bold select-none shadow-2xs overflow-hidden">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-text-sub transition-transform duration-150 ${
                    isDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* User Dropdown Menu Card */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-border-subtle bg-surface p-2 shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-subtle border border-border-subtle mb-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white font-bold text-xs select-none shadow-2xs overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                      ) : (
                        user.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-text-main truncate">{user.name}</p>
                      <p className="text-[11px] font-mono text-text-sub truncate">@{user.username}</p>
                      <p className="text-[10px] text-text-muted truncate">{user.email}</p>
                    </div>
                  </div>

                  {user.timezone && (
                    <div className="px-2.5 py-1.5 mb-1 flex items-center justify-between text-[11px] font-mono text-text-sub bg-surface-subtle rounded-md">
                      <span className="flex items-center gap-1.5 truncate">
                        <Globe className="h-3 w-3 text-text-muted shrink-0" />
                        <span className="truncate">{user.timezone}</span>
                      </span>
                      {currentTime && (
                        <span className="text-text-main font-semibold tabular-nums shrink-0">{currentTime}</span>
                      )}
                    </div>
                  )}

                  <Link
                    href={`/public/${user.username}`}
                    target="_blank"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-text-main hover:bg-surface-subtle transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <UserIcon className="h-3.5 w-3.5 text-text-main" />
                      <span>Public Booking Profile</span>
                    </div>
                    <ExternalLink className="h-3 w-3 text-text-muted" />
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-text-main hover:bg-surface-subtle transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5 text-text-main" />
                    <span>Account Settings</span>
                  </Link>

                  <div className="my-1 border-t border-border-subtle" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Dynamic Page Body (Full Width) */}
          <main className="flex-1 w-full max-w-full min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
