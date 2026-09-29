"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  History,
  Trash2,
  CalendarClock,
  CalendarX,
  Copy,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { api, type CurrentUser } from "@/lib/api";
import { ApiError, formatApiError } from "@/lib/api-error";
import { BookingDetailDrawer } from "@/components/booking-detail-drawer";
import { useScrollLock } from "@/lib/use-scroll-lock";
import type { BookingResponse, TimeSlot, RescheduleBookingBody } from "@sched/api-contract";

type TabStatus = "upcoming" | "past" | "cancelled";

export default function BookingsPage() {
  const [tab, setTab] = useState<TabStatus>("upcoming");
  const [dataByStatus, setDataByStatus] = useState<{
    upcoming: BookingResponse[];
    past: BookingResponse[];
    cancelled: BookingResponse[];
  }>({
    upcoming: [],
    past: [],
    cancelled: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  // Drawer state for meeting details
  const [selectedBooking, setSelectedBooking] = useState<BookingResponse | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Cancellation Modal state
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<BookingResponse | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Deletion Modal state
  const [deleteModalBooking, setDeleteModalBooking] = useState<BookingResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reschedule Modal state
  const [rescheduleModalBooking, setRescheduleModalBooking] = useState<BookingResponse | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [rescheduleMonth, setRescheduleMonth] = useState<Date>(new Date());
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isCopiedLink, setIsCopiedLink] = useState(false);

  // Lock background scroll when any booking modal is open
  useScrollLock(!!(cancelModalBooking || deleteModalBooking || rescheduleModalBooking));

  const loadAllBookings = async () => {
    setIsLoading(true);
    try {
      const [upcoming, past, cancelled, me] = await Promise.all([
        api<BookingResponse[]>("/bookings?status=upcoming"),
        api<BookingResponse[]>("/bookings?status=past"),
        api<BookingResponse[]>("/bookings?status=cancelled"),
        api<CurrentUser>("/auth/me").catch(() => null),
      ]);
      setDataByStatus({ upcoming, past, cancelled });
      if (me) {
        setCurrentUser(me);
      }
      setSelectedBooking((prev) => {
        if (!prev) return null;
        const all = [...upcoming, ...past, ...cancelled];
        return all.find((item) => item.id === prev.id) || null;
      });
    } catch {
      toast.error("Failed to load bookings", "Could not fetch your meeting schedule.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyBookingLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = currentUser?.username ? `${origin}/public/${currentUser.username}` : `${origin}/dashboard`;
    void navigator.clipboard.writeText(url);
    setIsCopiedLink(true);
    toast.success("Booking link copied to clipboard", url);
    setTimeout(() => setIsCopiedLink(false), 2000);
  };

  const handleTabChange = (newTab: TabStatus) => {
    if (tab !== newTab) {
      setTab(newTab);
      setIsDrawerOpen(false);
      setSelectedBooking(null);
    }
  };

  useEffect(() => {
    void loadAllBookings();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (cancelModalBooking) setCancelModalBooking(null);
        else if (rescheduleModalBooking) setRescheduleModalBooking(null);
        else if (deleteModalBooking) setDeleteModalBooking(null);
        else if (isDrawerOpen) setIsDrawerOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelModalBooking, rescheduleModalBooking, deleteModalBooking, isDrawerOpen]);

  const bookings = dataByStatus[tab];

  // Fetch slots for host rescheduling modal
  useEffect(() => {
    if (!rescheduleModalBooking || !rescheduleDate) return;

    async function fetchHostSlots() {
      if (!rescheduleModalBooking) return;
      setIsLoadingSlots(true);
      setSelectedSlot(null);
      try {
        const data = await api<TimeSlot[]>(
          `/public/${rescheduleModalBooking.host.username}/${rescheduleModalBooking.eventType.slug}/slots?startDate=${rescheduleDate}&endDate=${rescheduleDate}&timezone=${encodeURIComponent(
            rescheduleModalBooking.host.timezone
          )}`
        );
        setRescheduleSlots(data);
      } catch {
        setRescheduleSlots([]);
      } finally {
        setIsLoadingSlots(false);
      }
    }

    void fetchHostSlots();
  }, [rescheduleModalBooking, rescheduleDate]);

  const handleCancelMeeting = async () => {
    if (!cancelModalBooking) return;
    setCancellingId(cancelModalBooking.id);
    try {
      await api<BookingResponse>(`/bookings/${cancelModalBooking.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedSequence: cancelModalBooking.sequence,
          reason: cancelReason || undefined,
        }),
      });

      toast.success(
        "Meeting Cancelled",
        `Booking with ${cancelModalBooking.attendeeName} has been cancelled.`
      );
      setCancelModalBooking(null);
      setCancelReason("");
      void loadAllBookings();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error("Cancellation Failed", err.message);
      } else {
        toast.error("Cancellation Failed", "An error occurred while cancelling.");
      }
    } finally {
      setCancellingId(null);
    }
  };

  const handleRescheduleMeeting = async () => {
    if (!rescheduleModalBooking || !selectedSlot) return;
    setIsRescheduling(true);
    try {
      const payload: RescheduleBookingBody = {
        startUtc: selectedSlot.startUtc,
        expectedSequence: rescheduleModalBooking.sequence,
        timeZone: rescheduleModalBooking.host.timezone,
        reason: rescheduleReason.trim() || undefined,
      };

      await api<BookingResponse>(`/bookings/${rescheduleModalBooking.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      toast.success(
        "Meeting Rescheduled",
        `Booking with ${rescheduleModalBooking.attendeeName} was successfully rescheduled.`
      );
      setRescheduleModalBooking(null);
      setSelectedSlot(null);
      setRescheduleReason("");
      void loadAllBookings();
    } catch (err) {
      toast.error(
        "Reschedule Failed",
        formatApiError(err, "Could not reschedule to the chosen slot.")
      );
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!deleteModalBooking) return;
    setIsDeleting(true);
    try {
      await api<{ success: boolean }>(`/bookings/${deleteModalBooking.id}`, {
        method: "DELETE",
      });

      toast.success(
        "Booking Deleted",
        `Booking with ${deleteModalBooking.attendeeName} was removed from your history.`
      );
      setDeleteModalBooking(null);
      void loadAllBookings();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error("Deletion Failed", err.message);
      } else {
        toast.error("Deletion Failed", "An error occurred while deleting the booking.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Reschedule calendar generation
  const resYear = rescheduleMonth.getFullYear();
  const resMonth = rescheduleMonth.getMonth();
  const firstDay = new Date(resYear, resMonth, 1).getDay();
  const daysInMonth = new Date(resYear, resMonth + 1, 0).getDate();
  const calDays = [];
  for (let i = 0; i < firstDay; i++) {
    calDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const formatted = `${resYear}-${String(resMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calDays.push({ day: d, dateStr: formatted });
  }

  const resMonthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(rescheduleMonth);

  const groupedBookings = useMemo(() => {
    const groups: { [key: string]: { dayLabel: string; isToday: boolean; items: BookingResponse[] } } = {};
    const todayStr = new Intl.DateTimeFormat("en-US", {
      timeZone: currentUser?.timezone || "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(new Date());

    bookings.forEach((b) => {
      const d = new Date(b.startTime);
      const dateKey = new Intl.DateTimeFormat("en-US", {
        timeZone: b.host.timezone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
      }).format(d);

      const isToday = dateKey === todayStr;

      const weekdayShort = new Intl.DateTimeFormat("en-US", {
        timeZone: b.host.timezone,
        weekday: "short",
      }).format(d);

      const dayNum = new Intl.DateTimeFormat("en-US", {
        timeZone: b.host.timezone,
        day: "numeric",
      }).format(d);

      const monthShort = new Intl.DateTimeFormat("en-US", {
        timeZone: b.host.timezone,
        month: "short",
      }).format(d);

      const dayLabel = `${weekdayShort} ${dayNum} ${monthShort}`;

      if (!groups[dateKey]) {
        groups[dateKey] = {
          dayLabel,
          isToday,
          items: [],
        };
      }
      groups[dateKey].items.push(b);
    });

    return Object.values(groups);
  }, [bookings, currentUser?.timezone]);

  return (
    <div className="flex w-full h-full min-h-0 items-stretch overflow-hidden px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4 pt-0">
      {/* Main Content: subtle rounded surface, horizontally shrinks when BookingDetailDrawer opens */}
      <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col transition-all duration-300 ease-in-out bg-surface-subtle rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 shadow-xs overflow-hidden">
        {/* Fixed Header & Tabs Section */}
        <div className="shrink-0 space-y-4 pb-2">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Meetings
              </h1>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Track upcoming sessions, review meeting histories, reschedule conflicts, and manage cancellations.
              </p>
            </div>
          </div>

          {/* Filter Tabs without bottom divider */}
          <div className="flex items-center gap-6 pb-2 text-xs">
            <button
              type="button"
              onClick={() => handleTabChange("upcoming")}
              className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                tab === "upcoming"
                  ? "border-blue-600 text-blue-600 font-bold"
                  : "border-transparent text-neutral-600 hover:text-neutral-900 font-medium"
              }`}
            >
              <span>Upcoming</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("past")}
              className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                tab === "past"
                  ? "border-blue-600 text-blue-600 font-bold"
                  : "border-transparent text-neutral-600 hover:text-neutral-900 font-medium"
              }`}
            >
              <span>Past</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("cancelled")}
              className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                tab === "cancelled"
                  ? "border-blue-600 text-blue-600 font-bold"
                  : "border-transparent text-neutral-600 hover:text-neutral-900 font-medium"
              }`}
            >
              <span>Cancelled</span>
            </button>
          </div>
        </div>

        {/* Dedicated Scroll Container for Content List */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-3 sm:pr-4 pt-1">
          {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ) : bookings.length === 0 ? (
              <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 sm:p-10 text-center shadow-2xs">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)] mb-3">
                  {tab === "upcoming" && <CalendarClock className="h-5 w-5" />}
                  {tab === "past" && <History className="h-5 w-5" />}
                  {tab === "cancelled" && <CalendarX className="h-5 w-5" />}
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {tab === "upcoming" && "No upcoming meetings"}
                  {tab === "past" && "No completed meetings yet"}
                  {tab === "cancelled" && "No cancelled meetings"}
                </h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                  {tab === "upcoming" &&
                    "Share your booking page to receive new meetings."}
                  {tab === "past" &&
                    "Completed meetings will appear here after they happen."}
                  {tab === "cancelled" &&
                    "Cancelled meetings will appear here when a meeting is cancelled."}
                </p>
                {tab === "upcoming" && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCopyBookingLink}
                      className="gap-1.5"
                    >
                      {isCopiedLink ? (
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
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard">
                        <span>View Event Types</span>
                      </Link>
                    </Button>
                  </div>
                )}
              </Card>
            ) : (
              <div className="space-y-6">
                {groupedBookings.map((group, gIdx) => (
                  <div key={gIdx} className="space-y-3">
                    {/* Day Header without horizontal line and larger font */}
                    <div className="flex items-center gap-2.5 pt-1">
                      <span className="text-sm sm:text-base font-bold text-neutral-900">
                        {group.dayLabel}
                      </span>
                      {group.isToday && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                          Today
                        </span>
                      )}
                    </div>

                    {/* Meeting Cards inside this day */}
                    <div className="space-y-2.5">
                      {group.items.map((b) => {
                        const startDate = new Date(b.startTime);
                        const endDate = new Date(b.endTime);

                        const startHourMin = new Intl.DateTimeFormat("en-US", {
                          timeZone: b.host.timezone,
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        }).format(startDate).replace(":00", "").toLowerCase();

                        const endHourMin = new Intl.DateTimeFormat("en-US", {
                          timeZone: b.host.timezone,
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        }).format(endDate).toLowerCase();

                        const timeStr = `${startHourMin} – ${endHourMin}`;
                        const isSelected = selectedBooking?.id === b.id && isDrawerOpen;

                        return (
                          <div
                            key={b.id}
                            onClick={() => {
                              setSelectedBooking(b);
                              setIsDrawerOpen(true);
                            }}
                            className={`group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:px-6 sm:py-4 rounded-2xl border transition-all duration-150 cursor-pointer shadow-2xs gap-2 sm:gap-4 ${
                              isSelected
                                ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500 shadow-xs"
                                : "border-neutral-200 bg-white hover:bg-blue-50/40 hover:border-blue-300"
                            }`}
                          >
                            {/* Left: Time */}
                            <div className="sm:w-36 md:w-40 shrink-0 text-xs sm:text-sm font-semibold text-neutral-700 tabular-nums">
                              {timeStr}
                            </div>

                            {/* Center: Dot + Title as meeting name with invitee */}
                            <div className="flex-1 flex items-center gap-2.5 sm:gap-3 min-w-0 sm:px-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-purple-500 shrink-0" />
                              <p className="text-sm sm:text-base font-bold text-neutral-900 truncate">
                                {b.eventType.title}{" "}
                                <span className="font-normal text-neutral-500">with {b.attendeeName}</span>
                              </p>
                            </div>

                            {/* Right: Status badge if cancelled */}
                            {b.status === "CANCELLED" && (
                              <div className="shrink-0 flex items-center gap-2 self-start sm:self-center">
                                <Badge variant="danger" className="text-xs py-0.5 px-2.5">
                                  Cancelled
                                </Badge>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

          {/* Slide-in Sidebar Drawer with Meeting Info (Matching Screenshot) */}
          <BookingDetailDrawer
            booking={selectedBooking}
            isOpen={isDrawerOpen && selectedBooking !== null}
            onClose={() => setIsDrawerOpen(false)}
            onReschedule={(b) => {
              setRescheduleModalBooking(b);
              setSelectedSlot(null);
              setRescheduleReason("");
            }}
            onCancel={(b) => setCancelModalBooking(b)}
            onDelete={(b) => setDeleteModalBooking(b)}
          />

        {/* Reschedule Modal */}
        {rescheduleModalBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
            <div className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Reschedule Meeting
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      {rescheduleModalBooking.eventType.title} with {rescheduleModalBooking.attendeeName}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRescheduleModalBooking(null)}
                >
                  ✕
                </Button>
              </div>

              {/* Date Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{resMonthLabel}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRescheduleMonth(new Date(resYear, resMonth - 1, 1))
                      }
                      className="h-6 w-6 p-0"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRescheduleMonth(new Date(resYear, resMonth + 1, 1))
                      }
                      className="h-6 w-6 p-0"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="text-[10px] font-medium text-[var(--text-muted)] py-0.5">
                      {d}
                    </div>
                  ))}
                  {calDays.map((item, idx) => {
                    if (!item) {
                      return <div key={`empty-res-${idx}`} className="h-7" />;
                    }
                    const isSelected = rescheduleDate === item.dateStr;
                    const isPast =
                      new Date(`${item.dateStr}T23:59:59`).getTime() <
                      new Date().setHours(0, 0, 0, 0);

                    return (
                      <button
                        key={item.dateStr}
                        type="button"
                        disabled={isPast}
                        onClick={() => setRescheduleDate(item.dateStr)}
                        className={`h-7 w-full rounded text-xs font-medium transition-colors ${
                          isSelected
                            ? "bg-blue-600 text-white font-bold"
                            : isPast
                            ? "text-neutral-300 dark:text-neutral-700 cursor-not-allowed"
                            : "hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] cursor-pointer"
                        }`}
                      >
                        {item.day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Slots */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Available Slots for {rescheduleDate} ({rescheduleModalBooking.host.timezone}):
                </label>
                {isLoadingSlots ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-8 w-full rounded" />
                    <Skeleton className="h-8 w-full rounded" />
                    <Skeleton className="h-8 w-full rounded" />
                  </div>
                ) : rescheduleSlots.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                    No open availability slots on this day.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                    {rescheduleSlots.map((s) => {
                      const isSelected = selectedSlot?.startUtc === s.startUtc;
                      const timeLabel = new Intl.DateTimeFormat("en-US", {
                        timeZone: rescheduleModalBooking.host.timezone,
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      }).format(new Date(s.startUtc));

                      return (
                        <button
                          key={s.startUtc}
                          type="button"
                          onClick={() => setSelectedSlot(s)}
                          className={`px-2.5 py-1.5 text-xs rounded-md border font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-blue-400 hover:text-blue-600"
                          }`}
                        >
                          {timeLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reason Input */}
              <div className="space-y-1">
                <label htmlFor="hostRescheduleReason" className="text-xs font-medium text-[var(--text-secondary)]">
                  Reschedule Reason (Optional)
                </label>
                <input
                  id="hostRescheduleReason"
                  type="text"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="e.g. Host schedule adjustment..."
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRescheduleModalBooking(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedSlot || isRescheduling}
                  onClick={handleRescheduleMeeting}
                >
                  {isRescheduling ? (
                    <>
                      <Spinner size="sm" />
                      <span>Rescheduling…</span>
                    </>
                  ) : (
                    <span>Confirm Reschedule</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Reason Modal */}
        {cancelModalBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Cancel Meeting
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {cancelModalBooking.eventType.title} with {cancelModalBooking.attendeeName}
                  </p>
                </div>
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Are you sure you want to cancel this booking? The slot will be returned to your open availability calendar.
              </p>

              <div className="space-y-1">
                <label htmlFor="modalCancelReason" className="text-xs font-medium text-[var(--text-secondary)]">
                  Cancellation Reason (Optional)
                </label>
                <input
                  id="modalCancelReason"
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Unforeseen scheduling conflict..."
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCancelModalBooking(null);
                    setCancelReason("");
                  }}
                >
                  Keep Meeting
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={Boolean(cancellingId)}
                  onClick={handleCancelMeeting}
                >
                  {cancellingId ? (
                    <>
                      <Spinner size="sm" />
                      <span>Cancelling…</span>
                    </>
                  ) : (
                    <span>Cancel Meeting</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteModalBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Delete Cancelled Booking
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {deleteModalBooking.eventType.title} with {deleteModalBooking.attendeeName}
                  </p>
                </div>
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Are you sure you want to permanently remove this cancelled booking from your history? This action cannot be undone.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteModalBooking(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                  onClick={handleDeleteBooking}
                >
                  {isDeleting ? (
                    <>
                      <Spinner size="sm" />
                      <span>Deleting…</span>
                    </>
                  ) : (
                    <span>Delete Booking</span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
