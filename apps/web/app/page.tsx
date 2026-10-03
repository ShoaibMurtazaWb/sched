"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Clock,
  Globe,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Sparkles,
  ShieldCheck,
  Zap,
  Layers,
  ExternalLink,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type CurrentUser } from "@/lib/api";

const DEMO_EVENTS = [
  {
    id: "1",
    title: "30 Min Discovery Call",
    duration: 30,
    slug: "discovery",
    description: "Introductory consultation to align on architecture, goals, and delivery timelines.",
  },
  {
    id: "2",
    title: "45 Min Technical Deep Dive",
    duration: 45,
    slug: "tech-deep-dive",
    description: "Structured architectural review, code walkthrough, and technical roadmap planning.",
  },
  {
    id: "3",
    title: "15 Min Quick Sync",
    duration: 15,
    slug: "quick-sync",
    description: "Brief checkpoint for rapid Q&A, status updates, and priority unblocking.",
  },
];

const SAMPLE_SLOTS = [
  "09:00 AM",
  "09:30 AM",
  "10:30 AM",
  "11:00 AM",
  "01:30 PM",
  "02:00 PM",
  "03:30 PM",
  "04:00 PM",
];

const FEATURES = [
  {
    icon: <Zap className="h-4 w-4 text-[var(--text-primary)]" />,
    title: "Sub-Second Slot Projection",
    description:
      "Deterministic availability generation engine computing conflict-free slots with zero calendar overlaps.",
    tag: "Performance",
  },
  {
    icon: <Globe className="h-4 w-4 text-[var(--text-primary)]" />,
    title: "Universal IANA Timezones",
    description:
      "Bi-directional timezone conversion between hosts and invitees with automatic daylight saving transition safety.",
    tag: "Global Ready",
  },
  {
    icon: <ShieldCheck className="h-4 w-4 text-[var(--text-primary)]" />,
    title: "Concurrency Lock Protection",
    description:
      "Database-level concurrency safeguards ensuring two invitees cannot double-book identical time slots.",
    tag: "Zero Conflicts",
  },
  {
    icon: <Calendar className="h-4 w-4 text-[var(--text-primary)]" />,
    title: "Clean Booking URLs",
    description:
      "Memorable, fast personal URLs like /public/username/slug that deliver a frictionless booking flow.",
    tag: "Direct Links",
  },
  {
    icon: <Clock className="h-4 w-4 text-[var(--text-primary)]" />,
    title: "Granular Schedule Control",
    description:
      "Configure custom weekly recurring hours, minimum booking notices, buffers, and date-specific blackout overrides.",
    tag: "Availability",
  },
  {
    icon: <Layers className="h-4 w-4 text-[var(--text-primary)]" />,
    title: "Modern Full-Stack SaaS",
    description:
      "Engineered with Next.js 15, Turborepo, NestJS, and PostgreSQL with sub-50ms latency worldwide.",
    tag: "Architecture",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Configure Availability",
    description: "Define weekly working hours, meeting buffers, advance notice limits, and specific date overrides.",
  },
  {
    step: "02",
    title: "Create Event Types",
    description: "Set up 15, 30, or 45-minute booking types with custom slugs, durations, and descriptions.",
  },
  {
    step: "03",
    title: "Share Your Link",
    description: "Send your clean personalized URL to clients or colleagues for instantaneous slot reservation.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<(typeof DEMO_EVENTS)[number]>(DEMO_EVENTS[0]!);
  const [selectedSlot, setSelectedSlot] = useState<string | null>("10:30 AM");
  const [bookedState, setBookedState] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    // Check if current user is logged in and redirect to dashboard
    api<CurrentUser>("/auth/me")
      .then((currentUser) => {
        setUser(currentUser);
        router.replace("/dashboard");
      })
      .catch(() => {
        setUser(null);
        setIsCheckingAuth(false);
      });

    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [router]);

  const handleBookSlot = (slot: string) => {
    setSelectedSlot(slot);
    setBookedState(true);
    setTimeout(() => {
      setBookedState(false);
    }, 4000);
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center">
        <Logo className="h-10 w-10 animate-logo-pulse shrink-0" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] font-sans text-[var(--text-primary)] selection:bg-blue-600 selection:text-white">
      {/* Top Announcement Bar */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-center text-xs font-medium text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
          High-precision scheduling infrastructure for modern teams and hosts
        </span>
      </div>

      {/* Header / Navbar */}
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-[opacity] duration-150 hover:opacity-90"
          >
            <Logo className="h-8 w-8 shrink-0 shadow-2xs" />
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Sched</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 md:flex text-sm font-medium text-[var(--text-secondary)]">
            <a
              href="#features"
              className="transition-[color] duration-150 hover:text-blue-600"
            >
              Features
            </a>
            <a
              href="#interactive-demo"
              className="transition-[color] duration-150 hover:text-blue-600"
            >
              Live Preview
            </a>
            <a
              href="#how-it-works"
              className="transition-[color] duration-150 hover:text-blue-600"
            >
              How it Works
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2.5">
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-xs text-[var(--text-secondary)] hover:text-blue-600 gap-1.5">
                  <Link href={`/public/${user.username}`} target="_blank">
                    <span>Public Profile</span>
                    <ExternalLink className="h-3 w-3 text-[var(--text-muted)]" />
                  </Link>
                </Button>
                <Button asChild size="sm" className="gap-1.5">
                  <Link href="/dashboard">
                    <span>Dashboard</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Link
                  href="/dashboard"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold shadow-2xs select-none hover:scale-105 transition-transform"
                  title={`${user.name} (@${user.username})`}
                >
                  {user.name.charAt(0).toUpperCase()}
                </Link>
              </div>
            ) : (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">
                    <span>Get started</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-14 md:pt-24 md:pb-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <Badge variant="default" className="rounded-full px-3 py-1 text-xs shadow-2xs bg-blue-50 text-blue-700 border border-blue-200">
            <span className="h-2 w-2 rounded-full bg-blue-600 mr-1.5" />
            <span>Autonomous Scheduling · Zero Double-Bookings</span>
          </Badge>

          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl sm:leading-[1.15]">
            Share your page. <br className="hidden sm:inline" />
            <span className="text-blue-600">Book effortlessly.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg leading-relaxed">
            Create custom event types and personal booking links with high-precision scheduling infrastructure.
            Synchronize real-time availability across global timezones and eliminate scheduling friction.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {user ? (
              <>
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/dashboard">
                    <span>Go to Dashboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="w-full sm:w-auto hover:text-blue-600">
                  <Link href={`/public/${user.username}`} target="_blank">
                    <span>View your public profile (@{user.username})</span>
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/register">
                    <span>Create account free</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="w-full sm:w-auto hover:text-blue-600">
                  <a href="#interactive-demo">View live demo</a>
                </Button>
              </>
            )}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Instant slot projection</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Automatic IANA timezone sync</span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Live Demo Preview */}
      <section id="interactive-demo" className="py-12">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Interactive Preview
              </p>
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                Test the booking experience
              </h2>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Select an event type and pick an available slot.
            </p>
          </div>

          {/* Browser Window Frame */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
            {/* Window header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
                </div>
                <span className="ml-2 font-mono text-[var(--text-muted)] text-[11px]">
                  https://sched.com/public/shoaib/{selectedEvent.slug}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>Host local: {currentTime || "10:00 AM"}</span>
              </div>
            </div>

            {/* Content Body */}
            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
              {/* Left Column: Host Details */}
              <div className="p-6 md:col-span-5 flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white select-none shadow-sm">
                      SM
                    </div>
                    <div>
                      <span className="font-semibold text-[var(--text-primary)] text-sm">Shoaib Murtaza</span>
                      <p className="text-xs text-[var(--text-muted)] font-mono">@shoaib · Product & Engineering</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                      Available Event Types
                    </p>
                    <div className="mt-2.5 space-y-2">
                      {DEMO_EVENTS.map((event) => {
                        const isSelected = selectedEvent.id === event.id;
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => setSelectedEvent(event)}
                            className={`w-full text-left rounded-xl p-3 transition-[background-color,border-color,box-shadow] duration-150 border cursor-pointer ${
                              isSelected
                                ? "border-blue-600 bg-blue-50/50 text-[var(--text-primary)] shadow-2xs"
                                : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-blue-300 hover:bg-[var(--bg-subtle)]/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-[var(--text-primary)]">{event.title}</span>
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums font-sans ${
                                isSelected ? "bg-blue-100 text-blue-700" : "bg-[var(--bg-muted)] text-[var(--text-secondary)]"
                              }`}>
                                {event.duration}m
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-1">{event.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 p-3 text-xs text-[var(--text-secondary)]">
                  <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <span>Google Meet / Zoom</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Meeting link generated automatically upon slot booking.
                  </p>
                </div>
              </div>

              {/* Right Column: Time Slot Selection */}
              <div className="p-6 md:col-span-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Select a Time Slot</h3>
                      <p className="text-xs text-[var(--text-muted)] font-mono">Today · Asia/Karachi (GMT+5)</p>
                    </div>
                    <Badge variant="secondary" className="tabular-nums font-sans bg-blue-50 text-blue-700 border-blue-100">
                      {SAMPLE_SLOTS.length} slots available
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {SAMPLE_SLOTS.map((slot) => {
                      const isSelected = selectedSlot === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleBookSlot(slot)}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] cursor-pointer ${
                            isSelected
                              ? "border-blue-600 bg-blue-600 text-white shadow-2xs"
                              : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-blue-400 hover:bg-blue-50/30"
                          }`}
                        >
                          <span className="tabular-nums font-sans">{slot}</span>
                          <span className={isSelected ? "text-blue-100 text-[11px]" : "text-[var(--text-muted)] text-[11px]"}>
                            {isSelected ? "Selected ✓" : "Book →"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Instant Feedback Notice */}
                {bookedState ? (
                  <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-3 text-center text-xs font-medium text-blue-700 transition-[opacity,transform] duration-150">
                    ✓ Simulated booking confirmed for <span className="font-semibold">{selectedEvent.title}</span> at{" "}
                    <span className="font-semibold tabular-nums font-sans">{selectedSlot}</span>
                  </div>
                ) : (
                  <div className="mt-6 flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Instant calendar synchronization</span>
                    <Link
                      href="/register"
                      className="font-medium text-blue-600 hover:underline"
                    >
                      Create your own link →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-16 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">High Reliability</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              Engineered for seamless calendar operations
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
              Everything required to manage host availability, prevent scheduling collisions, and project real-time slots.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-5 transition-[border-color,background-color,box-shadow] duration-150 hover:border-blue-300 hover:bg-[var(--bg-surface)] hover:shadow-2xs"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xs text-blue-600">
                    {feature.icon}
                  </div>
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">{feature.tag}</Badge>
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{feature.title}</h3>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-16 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Fast Setup</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              Get started in three simple steps
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((s, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xs hover:border-blue-200 transition-colors"
              >
                <span className="font-mono text-2xl font-bold text-blue-600">{s.step}</span>
                <h3 className="mt-3 text-base font-semibold text-[var(--text-primary)]">{s.title}</h3>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="py-14 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto max-w-4xl px-6">
          <div className="rounded-2xl border border-blue-700 bg-gradient-to-br from-blue-600 to-blue-700 p-8 sm:p-10 text-center text-white shadow-md">
            {user ? (
              <>
                <h2 className="text-2xl font-bold sm:text-3xl">Ready to manage your schedule, {user.name}?</h2>
                <p className="mx-auto mt-2 max-w-lg text-xs sm:text-sm text-blue-100">
                  Jump back into your dashboard to configure event types, review bookings, or update working hours.
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="w-full sm:w-auto bg-white text-blue-600 hover:bg-blue-50 font-semibold shadow-sm"
                  >
                    <Link href="/dashboard">Open Host Dashboard</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    className="w-full sm:w-auto border border-blue-400/40 bg-blue-800/40 text-white hover:bg-blue-800/60"
                  >
                    <Link href={`/public/${user.username}`} target="_blank">
                      <span>View public page</span>
                      <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold sm:text-3xl">Ready to streamline your scheduling?</h2>
                <p className="mx-auto mt-2 max-w-lg text-xs sm:text-sm text-blue-100">
                  Create your custom booking page, manage availability, and let attendees book slots directly.
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="w-full sm:w-auto bg-white text-blue-600 hover:bg-blue-50 font-semibold shadow-sm"
                  >
                    <Link href="/register">Create your page free</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    className="w-full sm:w-auto border border-blue-400/40 bg-blue-800/40 text-white hover:bg-blue-800/60"
                  >
                    <Link href="/login">Sign in to Dashboard</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <Logo className="h-5 w-5 shrink-0" />
            <span className="font-semibold text-[var(--text-primary)]">Sched</span>
            <span>— Autonomous Scheduling Platform</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              All systems operational
            </span>
            <span>Next.js 15 & NestJS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

