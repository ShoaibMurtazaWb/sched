"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  TrendingUp,
  Layers,
  Copy,
  Check,
  CalendarClock,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api, type CurrentUser } from "@/lib/api";
import type { AnalyticsRange, HostAnalyticsResponse } from "@sched/api-contract";

export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [data, setData] = useState<HostAnalyticsResponse | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnimated, setIsAnimated] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    api<CurrentUser>("/auth/me").then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    async function loadAnalytics() {
      setIsLoading(true);
      setIsAnimated(false);
      try {
        const response = await api<HostAnalyticsResponse>(`/analytics/overview?range=${range}`);
        setData(response);
      } catch {
        toast.error("Failed to load analytics", "Could not fetch host meeting metrics.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadAnalytics();
  }, [range]);

  useEffect(() => {
    if (!isLoading && data) {
      const timer = setTimeout(() => {
        setIsAnimated(true);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setIsAnimated(false);
    }
  }, [isLoading, data]);

  const handleCopyBookingPageLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = user?.username ? `${origin}/public/${user.username}` : `${origin}/dashboard`;
    void navigator.clipboard.writeText(url);
    setIsCopied(true);
    toast.success("Booking page link copied", url);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const rangeLabels: Record<AnalyticsRange, string> = {
    "7d": "Last 7 Days",
    "30d": "Last 30 Days",
    "90d": "Last 90 Days",
    all: "All Time",
  };

  const hasBookings = (data?.summary.totalBookings ?? 0) > 0;
  const hasCompletedMeetings = (data?.summary.confirmedCount ?? 0) > 0;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-2 sm:px-4 md:px-6 lg:px-8 pb-4 sm:pb-6 md:pb-8 pt-0 space-y-6">
      {/* Page Header with Timeframe Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Analytics
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Overview of meeting volume, completed sessions, adjustments, and popular booking patterns.
          </p>
        </div>

        {/* Timeframe Filter Pills */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
          {(["7d", "30d", "90d", "all"] as AnalyticsRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                range === r
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
              }`}
            >
              {rangeLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : !data ? null : (
        /* Analytics Dashboard View */
        <div className="space-y-6">
          {/* KPI Summary Grid: Total Meetings, Completed, Rescheduled, Cancelled */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Total Meetings */}
            <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Total Meetings</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-[var(--text-primary)] tabular-nums font-sans">
                  {data.summary.totalBookings}
                </span>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  All scheduled meetings
                </p>
              </div>
            </Card>

            {/* 2. Completed */}
            <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Completed</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-[var(--text-primary)] tabular-nums font-sans">
                  {data.summary.confirmedCount}
                </span>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {hasCompletedMeetings
                    ? `${data.summary.completionRate}% completion rate`
                    : "No completed meetings yet"}
                </p>
              </div>
            </Card>

            {/* 3. Rescheduled */}
            <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Rescheduled</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-amber-600 dark:text-amber-400">
                  <CalendarClock className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-[var(--text-primary)] tabular-nums font-sans">
                  {data.summary.rescheduledCount}
                </span>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  Adjusted meeting times
                </p>
              </div>
            </Card>

            {/* 4. Cancelled */}
            <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Cancelled</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-rose-600 dark:text-rose-400">
                  <XCircle className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-[var(--text-primary)] tabular-nums font-sans">
                  {data.summary.cancelledCount}
                </span>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  Cancelled sessions
                </p>
              </div>
            </Card>
          </div>

          {/* Event Types Breakdown & Day-of-Week Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Popular Events */}
            <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xs space-y-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[var(--text-muted)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      Popular Events
                    </h2>
                  </div>
                </div>

                {!hasBookings || data.eventTypes.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)] mb-3">
                      <Layers className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      No booking data yet
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-xs leading-relaxed">
                      Share your booking page to start seeing insights.
                    </p>
                    <div className="mt-4">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCopyBookingPageLink}
                        className="gap-1.5"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Booking Page Link</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {data.eventTypes.map((et) => (
                      <div key={et.eventTypeId} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span className="font-medium text-[var(--text-primary)] truncate">{et.title}</span>
                            <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">({et.durationMinutes}m)</span>
                          </div>
                          <div className="flex items-center gap-1.5 tabular-nums font-sans shrink-0">
                            <span className="font-semibold text-[var(--text-primary)]">{et.count}</span>
                            <span className="text-[var(--text-muted)] text-[11px]">({et.percentage}%)</span>
                          </div>
                        </div>
                        {/* Event Type Popularity Bar: Gray background track (#E5E7EB), Black fill (#18181B) */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                          <div
                            className="h-full rounded-full bg-[#18181B] transition-all duration-700 ease-out"
                            style={{
                              width: isAnimated
                                ? `${Math.min(Math.max(et.percentage, 0), 100)}%`
                                : "0%",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] flex items-center justify-between">
                <span>Based on total bookings</span>
                <span className="tabular-nums font-sans font-medium text-[var(--text-secondary)]">
                  {data.summary.totalBookings} total
                </span>
              </div>
            </Card>

            {/* Popular Days */}
            <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xs space-y-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[var(--text-muted)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      Popular Days
                    </h2>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)]">Booking frequency</span>
                </div>

                {!hasBookings ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)] mb-3">
                      <CalendarClock className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      No meeting activity yet
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-xs leading-relaxed">
                      Your booking patterns will appear here.
                    </p>
                  </div>
                ) : (
                  /* Vertical Bar Chart Area */
                  (() => {
                    const maxCount = Math.max(...data.dayOfWeekHeatmap.map((d) => d.count), 0);
                    const currentDayOfWeek = new Date().getDay();

                    return (
                      <div className="pt-4">
                        {/* Chart Grid Area with Baseline */}
                        <div className="h-36 flex items-end justify-between gap-2 sm:gap-3 pb-1 border-b border-[var(--border-subtle)]">
                          {data.dayOfWeekHeatmap.map((day) => {
                            const hasDayBookings = day.count > 0;
                            const isToday = day.dayOfWeek === currentDayOfWeek;
                            const heightPercent = maxCount > 0 ? Math.round((day.count / maxCount) * 100) : 0;

                            return (
                              <div
                                key={day.dayOfWeek}
                                className="flex-1 flex flex-col items-center justify-end h-full group relative"
                              >
                                {hasDayBookings ? (
                                  <>
                                    {/* Compact Hover Tooltip (Hover only) */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute -top-11 pointer-events-none z-20 flex flex-col items-center">
                                      <div className="rounded-md bg-[#18181B] text-white px-2 py-1 text-[10px] shadow-sm text-center whitespace-nowrap leading-tight">
                                        <div className="font-normal opacity-80">{day.dayName}</div>
                                        <div className="font-semibold tabular-nums font-sans">
                                          {day.count} {day.count === 1 ? "booking" : "bookings"}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Active Bar: Normal gray (#CBD5E1), Today black (#18181B) */}
                                    <div
                                      className={`w-full max-w-[20px] sm:max-w-[28px] rounded-t transition-all duration-700 ease-out group-hover:opacity-85 cursor-default ${
                                        isToday ? "bg-[#18181B]" : "bg-[#CBD5E1]"
                                      }`}
                                      style={{
                                        height: isAnimated
                                          ? `${Math.max(heightPercent, 8)}%`
                                          : "0%",
                                      }}
                                    />
                                  </>
                                ) : (
                                  /* Inactive Baseline Marker: Normal gray (#E5E7EB), Today black (#18181B) */
                                  <div
                                    className={`w-full max-w-[20px] sm:max-w-[28px] h-1 rounded-sm ${
                                      isToday ? "bg-[#18181B]" : "bg-[#E5E7EB]"
                                    }`}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* X-Axis Labels: Day & Count */}
                        <div className="grid grid-cols-7 gap-2 sm:gap-3 pt-2.5 text-center">
                          {data.dayOfWeekHeatmap.map((day) => {
                            const isToday = day.dayOfWeek === currentDayOfWeek;
                            return (
                              <div key={day.dayOfWeek} className="flex flex-col items-center">
                                <span
                                  className={`text-[11px] transition-colors ${
                                    isToday
                                      ? "font-bold text-[var(--text-primary)]"
                                      : "font-medium text-[var(--text-muted)]"
                                  }`}
                                >
                                  {day.dayName.slice(0, 3)}
                                </span>
                                <span
                                  className={`text-[10px] tabular-nums font-sans ${
                                    isToday
                                      ? "font-bold text-[var(--text-primary)]"
                                      : "font-medium text-[var(--text-muted)]"
                                  }`}
                                >
                                  {day.count}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              <div className="pt-3.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] flex items-center justify-between">
                <span>Bookings by weekday</span>
                <span className="tabular-nums font-sans font-medium text-[var(--text-secondary)]">
                  {data.dayOfWeekHeatmap.reduce((acc, d) => acc + d.count, 0)} sessions
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
