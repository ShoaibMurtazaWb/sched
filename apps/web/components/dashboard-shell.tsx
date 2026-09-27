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
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { api, type CurrentUser } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Persisted collapsible sidebar state
  const [isCollapsed, setIsCollapsed] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Click-outside listener to close user menu dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

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
        label: "Admin center",
        href: "/dashboard/settings",
        active: pathname.startsWith("/dashboard/settings"),
        icon: Sliders,
      },
    ],
    [pathname]
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
      {/* Main App Container */}
      <div className="flex flex-1 min-h-0">
        {/* Mobile Header Bar (< md) */}
        <header className="md:hidden sticky top-0 z-40 flex w-full items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 cursor-pointer transition-colors"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <Logo className="h-7 w-7" />
              <span className="font-bold tracking-tight text-neutral-900 text-lg">Sched</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="h-8 px-3 text-xs rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 shadow-2xs cursor-pointer">
              <Link href="/dashboard/event-types/new">
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Create</span>
              </Link>
            </Button>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold shadow-2xs overflow-hidden shrink-0">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
          </div>
        </header>

        {/* Mobile Drawer Backdrop */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Dynamic Collapsible Sidebar Navigation */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex flex-col justify-between border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[width,transform] duration-500 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0 ${
            isMobileMenuOpen ? "translate-x-0 w-[260px]" : "-translate-x-full md:translate-x-0"
          } ${isCollapsed ? "md:w-[84px]" : "md:w-[260px]"}`}
        >
          {/* Floating Expand Button on Right Border (When Collapsed) - Centered with Logo */}
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

              {/* Desktop Collapse Button (When Expanded) - Exact matching size (32x32) with logo */}
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

              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="md:hidden p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* "+ Create" Action Button (Calendly Style) */}
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
                          ? "bg-blue-50 text-blue-600 font-semibold shadow-2xs"
                          : "text-neutral-700 hover:bg-neutral-100 hover:text-blue-600"
                      }`}
                      title={item.label}
                    >
                      <Icon className={`h-5 w-5 mb-1 shrink-0 ${item.active ? "text-blue-600" : "text-neutral-600"}`} />
                      <span className={`text-[10px] leading-tight line-clamp-1 font-semibold ${item.active ? "text-blue-600 font-bold" : "text-neutral-700"}`}>
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
                        ? "bg-blue-50 text-blue-600 font-semibold"
                        : "text-neutral-700 hover:bg-neutral-100 hover:text-blue-600"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        item.active ? "text-blue-600" : "text-neutral-600"
                      }`}
                    />
                    <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${item.active ? "text-blue-600 font-bold" : "text-neutral-800"}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Bottom Section: Analytics & Admin Center */}
          <div className={`mt-auto shrink-0 border-t border-[var(--border-subtle)] ${isCollapsed ? "px-3" : "px-5"} pt-3 pb-4 transition-[padding] duration-500`}>
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
                          ? "bg-blue-50 text-blue-600 font-semibold shadow-2xs"
                          : "text-neutral-700 hover:bg-neutral-100 hover:text-blue-600"
                      }`}
                      title={item.label}
                    >
                      <Icon className={`h-5 w-5 mb-1 shrink-0 ${item.active ? "text-blue-600" : "text-neutral-600"}`} />
                      <span className={`text-[10px] leading-tight line-clamp-1 font-semibold ${item.active ? "text-blue-600 font-bold" : "text-neutral-700"}`}>
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
                        ? "bg-blue-50 text-blue-600 font-semibold"
                        : "text-neutral-700 hover:bg-neutral-100 hover:text-blue-600"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${item.active ? "text-blue-600" : "text-neutral-600"}`} />
                    <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${item.active ? "text-blue-600 font-bold" : "text-neutral-800"}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-[var(--bg-canvas)]">
          {/* Top Bar with User Profile Dropdown (Full Width, Pure White Header with increased height) */}
          <header className="hidden md:flex h-20 w-full items-center justify-end bg-white border-b border-neutral-200 px-8 sm:px-12 md:px-16 gap-4">
            {/* User Profile Dropdown Menu in Top Navbar */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2.5 rounded-full p-1.5 pl-2.5 hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all cursor-pointer"
                aria-expanded={isDropdownOpen}
                aria-label="User account menu"
              >
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold select-none shadow-2xs overflow-hidden">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-neutral-700 transition-transform duration-150 ${
                    isDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* User Dropdown Menu Card */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] mb-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs select-none shadow-2xs overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                      ) : (
                        user.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-black truncate">{user.name}</p>
                      <p className="text-[11px] font-mono text-neutral-600 truncate">@{user.username}</p>
                      <p className="text-[10px] text-neutral-500 truncate">{user.email}</p>
                    </div>
                  </div>

                  {user.timezone && (
                    <div className="px-2.5 py-1.5 mb-1 flex items-center justify-between text-[11px] font-mono text-neutral-600 bg-neutral-50 rounded-md">
                      <span className="flex items-center gap-1.5 truncate">
                        <Globe className="h-3 w-3 text-neutral-400 shrink-0" />
                        <span className="truncate">{user.timezone}</span>
                      </span>
                      {currentTime && (
                        <span className="text-black font-semibold tabular-nums shrink-0">{currentTime}</span>
                      )}
                    </div>
                  )}

                  <Link
                    href={`/public/${user.username}`}
                    target="_blank"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-black hover:bg-[var(--bg-subtle)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <UserIcon className="h-3.5 w-3.5 text-black" />
                      <span>Public Booking Profile</span>
                    </div>
                    <ExternalLink className="h-3 w-3 text-neutral-500" />
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-black hover:bg-[var(--bg-subtle)] transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5 text-black" />
                    <span>Account Settings</span>
                  </Link>

                  <div className="my-1 border-t border-[var(--border-subtle)]" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Dynamic Page Body (Full Width with generous responsive padding) */}
          <main className="flex-1 w-full max-w-full px-3.5 sm:px-6 md:px-10 lg:px-14 py-4 sm:py-6 md:py-8 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
