"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  User,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  AlertCircle,
  Clock,
  MapPin,
  Video,
  PhoneCall,
  PhoneForwarded,
  Globe,
  Link2,
  ChevronDown,
  Home,
  Check,
} from "lucide-react";
import { ZoomLogo } from "@/components/zoom-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import type { BookingResponse } from "@sched/api-contract";

export default function PublicBookingConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [capabilityToken, setCapabilityToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Bootstrap capability token and remove from URL
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");
    let token = tokenFromUrl;

    if (tokenFromUrl) {
      // Store in session storage for refreshing
      try {
        sessionStorage.setItem(`booking_token_${id}`, tokenFromUrl);
      } catch {
        // Ignore storage errors
      }
      // Remove token query param from visible browser URL without reloading
      urlParams.delete("token");
      const newRelativePathQuery =
        window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : "");
      window.history.replaceState({}, "", newRelativePathQuery);
    } else {
      try {
        token = sessionStorage.getItem(`booking_token_${id}`);
      } catch {
        // Ignore storage errors
      }
    }

    setCapabilityToken(token);
  }, [id]);

  // Click outside listener for menu dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    async function loadBooking() {
      setIsLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = {};
        if (capabilityToken) {
          headers["x-booking-token"] = capabilityToken;
        }
        const data = await api<BookingResponse>(`/public/bookings/${id}`, {
          headers,
        });
        setBooking(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError("Booking not found or this link is no longer valid.");
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Booking not found or this link is no longer valid.");
        }
      } finally {
        setIsLoading(false);
      }
    }
    void loadBooking();
  }, [id, capabilityToken]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-xl space-y-6">
          <Skeleton className="h-6 w-32 mx-auto rounded-md" />
          <Skeleton className="h-96 w-full rounded-2xl border border-[var(--border-subtle)]" />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] mb-4">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Booking Not Found</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-sm">
          {error || "Booking not found or this link is no longer valid."}
        </p>
        <Button asChild size="sm" className="mt-6">
          <Link href="/">Return to Home</Link>
        </Button>
      </div>
    );
  }

  const isCancelled = booking.status === "CANCELLED";
  const isPast = !isCancelled && new Date(booking.endTime).getTime() < Date.now();
  const isRescheduled = booking.rescheduleCount > 0;

  // Formatted date and times
  const startDate = new Date(booking.startTime);
  const endDate = new Date(booking.endTime);

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: booking.attendeeTimeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(startDate);

  const formattedStartTime = new Intl.DateTimeFormat("en-US", {
    timeZone: booking.attendeeTimeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(startDate);

  const formattedEndTime = new Intl.DateTimeFormat("en-US", {
    timeZone: booking.attendeeTimeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(endDate);

  const formattedTimeRange = `${formattedStartTime.toLowerCase().replace(/\s/g, "")} - ${formattedEndTime.toLowerCase().replace(/\s/g, "")}`;

  let timezoneDisplayName = booking.attendeeTimeZone;
  try {
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: booking.attendeeTimeZone,
      timeZoneName: "longGeneric",
    }).formatToParts(startDate);
    const tzMatch = tzParts.find((p) => p.type === "timeZoneName");
    if (tzMatch && tzMatch.value) {
      timezoneDisplayName = tzMatch.value;
    }
  } catch {
    timezoneDisplayName = booking.attendeeTimeZone;
  }

  let locationIcon = <Video className="h-4 w-4 text-neutral-500 shrink-0" />;
  let locationContent: React.ReactNode = "Web conferencing details provided";

  if (booking.location) {
    if (booking.location.type === "ZOOM") {
      locationIcon = <ZoomLogo className="h-4 w-4 shrink-0" />;
      const zoomUrl = booking.location.data?.joinUrl || booking.location.data?.url;
      const passcode = booking.location.data?.password;
      locationContent = zoomUrl ? (
        <div className="inline-flex flex-wrap items-center gap-2">
          <a
            href={String(zoomUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-semibold break-all"
          >
            Join Zoom Meeting
          </a>
          {Boolean(passcode) && (
            <span className="text-xs text-neutral-500 font-normal">
              (Passcode: {String(passcode)})
            </span>
          )}
        </div>
      ) : (
        "Zoom meeting details provided in confirmation email"
      );
    } else if (booking.location.type === "IN_PERSON") {
      locationIcon = <MapPin className="h-4 w-4 text-neutral-500 shrink-0" />;
      locationContent = String(booking.location.data?.address || "In-person venue");
    } else if (booking.location.type === "STATIC_VIDEO" || booking.location.type === "CUSTOM_LINK") {
      locationIcon = <Video className="h-4 w-4 text-neutral-500 shrink-0" />;
      locationContent = booking.location.data?.url ? (
        <a
          href={String(booking.location.data.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline break-all"
        >
          {String(booking.location.data.url)}
        </a>
      ) : (
        "Video meeting link provided"
      );
    } else if (booking.location.type === "HOST_CALLS_ATTENDEE") {
      locationIcon = <PhoneCall className="h-4 w-4 text-neutral-500 shrink-0" />;
      locationContent = booking.attendeePhoneNumber || "Host will call attendee";
    } else if (booking.location.type === "ATTENDEE_CALLS_HOST") {
      locationIcon = <PhoneForwarded className="h-4 w-4 text-neutral-500 shrink-0" />;
      locationContent = String(booking.location.data?.hostPhoneNumber || "Call host");
    }
  } else if (booking.attendeePhoneNumber) {
    locationIcon = <PhoneCall className="h-4 w-4 text-neutral-500 shrink-0" />;
    locationContent = booking.attendeePhoneNumber;
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg-canvas)] font-sans text-[var(--text-primary)] selection:bg-blue-600 selection:text-white">
      {/* Top Header matching Calendly */}
      <header className="w-full max-w-5xl mx-auto px-6 py-4 flex items-center justify-end gap-3">
        {/* Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-neutral-700 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <span>Menu</span>
            <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-150">
              <Link
                href={`/public/${booking.host.username}`}
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                <User className="h-3.5 w-3.5 text-neutral-500" />
                <span>Host profile</span>
              </Link>
              <Link
                href="/"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                <Home className="h-3.5 w-3.5 text-neutral-500" />
                <span>Home</span>
              </Link>
            </div>
          )}
        </div>

        {/* Copy link button */}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") {
              void navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              toast.success("Link copied to clipboard!");
              setTimeout(() => setCopied(false), 2000);
            }
          }}
          className="rounded-full border-neutral-300 bg-white hover:bg-neutral-50 px-4 py-1.5 text-xs font-semibold text-neutral-800 gap-1.5 shadow-2xs cursor-pointer"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5 text-neutral-600" />}
          <span>{copied ? "Copied!" : "Copy link"}</span>
        </Button>
      </header>

      <main className="flex-1 px-4 sm:px-6 pb-16 flex flex-col justify-center items-center">
        <div className="w-full max-w-[860px]">
          {/* Main White Card matching Calendly */}
          <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs relative overflow-hidden py-12 px-6 sm:px-14 text-center">
            {/* Top Right Diagonal Ribbon */}
            <div className="absolute top-0 right-0 overflow-hidden w-28 h-28 pointer-events-none">
              <div className="absolute top-6 -right-8 w-36 bg-[#4D5055] text-white text-[9px] font-bold tracking-wider uppercase py-1 text-center rotate-45 shadow-sm select-none">
                Powered by Sched
              </div>
            </div>

            {/* Header Status */}
            {isCancelled ? (
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <XCircle className="h-6 w-6 text-rose-600" />
                  <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Meeting Cancelled</h1>
                </div>
                <p className="text-xs sm:text-sm text-neutral-600">
                  {booking.cancelledBy === "HOST"
                    ? `Cancelled by host (${booking.host.name})`
                    : "Cancelled by attendee"}
                  {booking.cancellationReason && ` · "${booking.cancellationReason}"`}
                </p>
              </div>
            ) : isPast ? (
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CheckCircle2 className="h-6 w-6 text-neutral-500" />
                  <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Meeting Completed</h1>
                </div>
                <p className="text-xs sm:text-sm text-neutral-600">
                  This session with {booking.host.name} took place on {formattedDate}.
                </p>
              </div>
            ) : (
              <div className="space-y-2 mb-8">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 stroke-[2.5]" />
                  <h1 className="text-2xl font-bold text-[#0A2540] tracking-tight">
                    {isRescheduled ? "Meeting Rescheduled!" : "You are scheduled!"}
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-neutral-600 font-normal">
                  A calendar invitation has been sent to your email address.
                </p>
              </div>
            )}

            {/* Inner Details Box (Exact Match to Screenshot) */}
            <div className="w-full max-w-md mx-auto rounded-xl border border-neutral-200 p-6 text-left space-y-3.5 bg-white shadow-2xs">
              <h2 className="text-lg font-bold text-[#1D3557] tracking-tight">
                {booking.eventType.title}
              </h2>

              <div className="space-y-3 pt-1 text-xs sm:text-sm">
                {/* Host */}
                <div className="flex items-center gap-3 font-semibold text-neutral-700">
                  <User className="h-4 w-4 text-neutral-500 shrink-0" />
                  <span>{booking.host.name}</span>
                </div>

                {/* Date & Time */}
                <div className="flex items-center gap-3 font-semibold text-neutral-700">
                  <CalendarIcon className="h-4 w-4 text-neutral-500 shrink-0" />
                  <span>{formattedTimeRange}, {formattedDate}</span>
                </div>

                {/* Timezone */}
                <div className="flex items-center gap-3 font-semibold text-neutral-700">
                  <Globe className="h-4 w-4 text-neutral-500 shrink-0" />
                  <span>{timezoneDisplayName}</span>
                </div>

                {/* Location */}
                <div className="flex items-center gap-3 font-semibold text-neutral-700">
                  {locationIcon}
                  <span>{locationContent}</span>
                </div>

                {booking.location?.type === "ZOOM" && Boolean(booking.location.data?.joinUrl) && !isCancelled && !isPast && (
                  <div className="pt-2 border-t border-neutral-100">
                    <a
                      href={String(booking.location.data.joinUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-[#2D8CFF] hover:bg-blue-600 text-white font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
                    >
                      <ZoomLogo className="h-4 w-4" />
                      <span>Join Zoom Meeting</span>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Custom Answers & Notes Area */}
            <div className="w-full max-w-md mx-auto mt-6 space-y-4 text-xs">
              {/* Previous time notice if rescheduled */}
              {isRescheduled && booking.previousStartTime && !isCancelled && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-amber-900 flex items-start gap-2.5 text-left">
                  <Clock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Rescheduled from previous time:</p>
                    <p className="text-[11px]">
                      {new Intl.DateTimeFormat("en-US", {
                        timeZone: booking.attendeeTimeZone,
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(booking.previousStartTime))}
                      {booking.rescheduleReason && ` · Reason: "${booking.rescheduleReason}"`}
                    </p>
                  </div>
                </div>
              )}

              {/* Custom Form Answers */}
              {booking.customResponses && booking.customResponses.length > 0 && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 space-y-2 text-left">
                  <p className="font-semibold text-neutral-900">Custom Answers:</p>
                  <div className="space-y-1.5 text-xs">
                    {booking.customResponses.map((r) => (
                      <div
                        key={r.questionId}
                        className="flex flex-col sm:flex-row sm:justify-between text-neutral-700 py-0.5 border-b border-neutral-200/50 last:border-b-0"
                      >
                        <span className="font-medium text-neutral-500">{r.label}:</span>
                        <span className="font-semibold text-neutral-900 sm:text-right">
                          {r.type === "CHECKBOX"
                            ? r.value
                              ? "✓ Yes"
                              : "No"
                            : r.type === "SELECT"
                            ? r.selectedOptionLabel || String(r.value)
                            : String(r.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {booking.attendeeNotes && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5 text-left text-neutral-700">
                  <p className="font-semibold text-neutral-900">Notes / Agenda:</p>
                  <p className="mt-0.5 text-[11px] text-neutral-600 whitespace-pre-wrap">
                    {booking.attendeeNotes}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Action */}
            <div className="pt-8 mt-6 border-t border-neutral-200/70 flex items-center justify-between text-xs max-w-md mx-auto">
              <Link
                href={`/public/${booking.host.username}/${booking.eventType.slug}`}
                className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Schedule another meeting</span>
              </Link>
              <Link
                href={`/public/${booking.host.username}`}
                className="font-medium text-neutral-500 hover:text-neutral-800 transition-colors"
              >
                View all event types
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
