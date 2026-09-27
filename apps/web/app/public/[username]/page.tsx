"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Calendar,
  ArrowRight,
  Globe,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/logo";
import type { PublicHostProfileResponse } from "@sched/api-contract";

export default function PublicHostPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const [profile, setProfile] = useState<PublicHostProfileResponse | null>(null);
  const [hostTime, setHostTime] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHostProfile() {
      setIsLoading(true);
      try {
        const data = await api<PublicHostProfileResponse>(`/public/${username}`);
        setProfile(data);
      } catch {
        setError("Host profile not found or unavailable.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadHostProfile();
  }, [username]);

  // Minute-level clock updates to eliminate per-second repaints
  useEffect(() => {
    if (!profile?.user.timezone) return;

    function updateClock() {
      try {
        const now = new Date();
        setHostTime(
          now.toLocaleTimeString("en-US", {
            timeZone: profile?.user.timezone,
            hour: "2-digit",
            minute: "2-digit",
          })
        );
      } catch {
        setHostTime("");
      }
    }

    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, [profile?.user.timezone]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] font-sans text-[var(--text-primary)]">
        <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <div className="flex items-center gap-2">
              <Logo className="h-7 w-7 shrink-0" />
              <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">Sched</span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-6 py-12 space-y-10">
          <Skeleton className="h-32 rounded-xl border border-[var(--border-subtle)]" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-xl border border-[var(--border-subtle)]" />
            <Skeleton className="h-40 rounded-xl border border-[var(--border-subtle)]" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)] mb-4">
          <Calendar className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Host Not Found</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-sm">
          The user @{username} does not exist or has no active public booking links.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors duration-150 shadow-xs"
        >
          <span>Return Home</span>
        </Link>
      </div>
    );
  }

  const initials = profile.user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "H";

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg-canvas)] font-sans text-[var(--text-primary)]">
      {/* Header */}
      <div>
        <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Logo className="h-7 w-7 shrink-0" />
              <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">Sched</span>
            </Link>
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <span>Accepting bookings</span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-6 py-12 space-y-10">
          {/* Host Profile Card */}
          <Card className="p-8 bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left rounded-xl">
            {profile.user.avatarUrl ? (
              <img
                src={profile.user.avatarUrl}
                alt={profile.user.name}
                className="h-16 w-16 shrink-0 rounded-full object-cover border border-[var(--border-subtle)] shadow-2xs"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-2xs">
                {initials}
              </div>
            )}

            <div className="flex-1 space-y-1.5">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{profile.user.name}</h1>
              <p className="text-xs font-mono text-[var(--text-muted)]">@{profile.user.username}</p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-2 text-xs text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5 font-mono">
                  <Globe className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>{profile.user.timezone}</span>
                </div>
                {hostTime && (
                  <div className="flex items-center gap-1.5 font-mono">
                    <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>Local Time: <span className="tabular-nums">{hostTime}</span></span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Active Event Types List */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Select an Event Type</h2>
              <p className="text-xs text-[var(--text-secondary)]">Choose a meeting format to view available dates and times.</p>
            </div>

            {profile.eventTypes.length === 0 ? (
              <Card className="p-8 text-center bg-[var(--bg-surface)] border-[var(--border-subtle)] rounded-xl">
                <p className="text-sm text-[var(--text-muted)]">This host has no active event types available for booking.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profile.eventTypes.map((et) => (
                  <Link
                    key={et.id}
                    href={`/public/${profile.user.username}/${et.slug}`}
                    className="group block"
                  >
                    <Card className="h-full p-6 bg-[var(--bg-surface)] border-[var(--border-subtle)] rounded-xl shadow-2xs hover:border-blue-500 hover:shadow-xs transition-[border-color,box-shadow] duration-150 ease-out flex flex-col justify-between space-y-4 cursor-pointer">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold tabular-nums font-sans text-blue-700">
                            {et.durationMinutes} min meeting
                          </span>
                          <div className="flex items-center gap-1 text-xs text-neutral-500 group-hover:text-blue-600 transition-colors duration-150 font-semibold">
                            <span>Select</span>
                            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                          </div>
                        </div>

                        <h3 className="mt-3 text-base font-semibold text-[var(--text-primary)] group-hover:text-blue-600 transition-colors">
                          {et.title}
                        </h3>

                        {et.description && (
                          <p className="mt-1.5 text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                            {et.description}
                          </p>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-6 text-center mt-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          <span>Powered by</span>
          <Logo className="h-4 w-4" />
          <span className="font-semibold text-[var(--text-secondary)]">Sched</span>
        </Link>
      </footer>
    </div>
  );
}

