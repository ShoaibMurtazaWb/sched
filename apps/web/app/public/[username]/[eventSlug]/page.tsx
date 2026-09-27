"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  User,
  Mail,
  MapPin,
  Video,
  PhoneCall,
  PhoneForwarded,
  Link2,
  Phone,
  Home,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { Logo } from "@/components/logo";
import { ZoomLogo } from "@/components/zoom-logo";
import { TimezonePicker } from "@/components/timezone-picker";
import { api, type CurrentUser } from "@/lib/api";
import { ApiError, fieldErrors, getExistingBookingFromError } from "@/lib/api-error";
import type { BookingResponse, CustomQuestion, PublicLocationMetadata, TimeSlot } from "@sched/api-contract";

interface PublicEventDetails {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMinutes: number;
  location: PublicLocationMetadata | null;
  customQuestions: CustomQuestion[];
  host: {
    name: string;
    username: string;
    timezone: string;
  };
}

export default function PublicBookingPage({
  params,
}: {
  params: Promise<{ username: string; eventSlug: string }>;
}) {
  const router = useRouter();
  const { username, eventSlug } = use(params);
  const [eventDetails, setEventDetails] = useState<PublicEventDetails | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeHref, setHomeHref] = useState<string>("/");

  // Timezone state
  const [attendeeTimezone, setAttendeeTimezone] = useState<string>("UTC");

  // Mobile active step ('date' | 'slots' | 'details')
  const [mobileStep, setMobileStep] = useState<"date" | "slots" | "details">("date");

  // Calendar date selection
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  // Slots state
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // Conflict & duplicate states
  const [slotConflictMessage, setSlotConflictMessage] = useState<string | null>(null);
  const [existingBookingDuplicate, setExistingBookingDuplicate] = useState<{
    id: string;
    startTime: string;
    manageUrl: string;
  } | null>(null);

  // Form input state
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [attendeePhone, setAttendeePhone] = useState("");
  const [attendeeNotes, setAttendeeNotes] = useState("");
  const [customAnswers, setCustomAnswers] = useState<Record<string, string | boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldValidationErrors, setFieldValidationErrors] = useState<Record<string, string>>({});

  const setCustomAnswer = (qId: string, val: string | boolean) => {
    setCustomAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  // Check auth to route Home button to /dashboard or /
  useEffect(() => {
    api<CurrentUser>("/auth/me")
      .then((user) => {
        if (user?.id) {
          setHomeHref("/dashboard");
        }
      })
      .catch(() => {
        setHomeHref("/");
      });
  }, []);

  // Initialize browser timezone
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setAttendeeTimezone(detected);
    } catch {
      setAttendeeTimezone("UTC");
    }
  }, []);

  // Fetch event details
  useEffect(() => {
    async function loadEvent() {
      setIsLoadingEvent(true);
      setError(null);
      try {
        const data = await api<PublicEventDetails>(`/public/${username}/${eventSlug}`);
        setEventDetails(data);
      } catch {
        setError("Event not found or link has been archived.");
      } finally {
        setIsLoadingEvent(false);
      }
    }
    void loadEvent();
  }, [username, eventSlug]);

  const loadSlots = async () => {
    if (!eventDetails || !selectedDate) return;
    setIsLoadingSlots(true);
    try {
      const data = await api<TimeSlot[]>(
        `/public/${username}/${eventSlug}/slots?startDate=${selectedDate}&endDate=${selectedDate}&timezone=${encodeURIComponent(
          attendeeTimezone
        )}`
      );
      setSlots(data);
    } catch {
      setSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // Fetch slots whenever selectedDate or attendeeTimezone changes
  useEffect(() => {
    setSelectedSlot(null);
    void loadSlots();
  }, [eventDetails, selectedDate, attendeeTimezone, username, eventSlug]);

  const [slideDirection, setSlideDirection] = useState<"next" | "prev" | "none">("none");

  const handlePrevMonth = () => {
    setSlideDirection("prev");
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setSlideDirection("next");
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      toast.error("Slot Required", "Please select an available time slot first.");
      return;
    }

    setIsSubmitting(true);
    setFieldValidationErrors({});
    setSlotConflictMessage(null);

    try {
      const result = await api<BookingResponse>(`/public/${username}/${eventSlug}/book`, {
        method: "POST",
        body: JSON.stringify({
          startUtc: selectedSlot.startUtc,
          attendeeName,
          attendeeEmail,
          attendeeTimeZone: attendeeTimezone,
          attendeePhoneNumber: attendeePhone || undefined,
          attendeeNotes: attendeeNotes || undefined,
          customResponses: Object.keys(customAnswers).length > 0 ? customAnswers : undefined,
        }),
      });

      if (result.manageToken && typeof window !== "undefined") {
        try {
          sessionStorage.setItem(`booking_token_${result.id}`, result.manageToken);
        } catch {
          // Ignore storage errors
        }
      }

      toast.success("Booking Confirmed!", "Your meeting has been scheduled.");
      const tokenParam = result.manageToken ? `?token=${encodeURIComponent(result.manageToken)}` : "";
      router.push(`/public/bookings/${result.id}${tokenParam}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const code = err.body?.error?.code || err.body?.code;
        if (code === "BOOKING_ALREADY_EXISTS") {
          const existing = getExistingBookingFromError(err);
          if (existing) {
            setExistingBookingDuplicate(existing);
            return;
          }
        } else if (code === "SLOT_ALREADY_BOOKED" || code === "SLOT_UNAVAILABLE") {
          setSelectedSlot(null);
          setSlotConflictMessage(
            "This time slot was just booked by someone else. Please select another available time."
          );
          setMobileStep("slots");
          void loadSlots();
          return;
        }

        setFieldValidationErrors(fieldErrors(err));
        toast.error("Booking Failed", err.message || "Failed to schedule meeting.");
      } else {
        const msg = err instanceof Error ? err.message : "An unexpected error occurred while confirming your booking.";
        toast.error("Booking Failed", msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingEvent) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <Skeleton className="h-6 w-32 rounded-md" />
          <Skeleton className="h-96 w-full rounded-2xl border border-[var(--border-subtle)]" />
        </div>
      </div>
    );
  }

  if (error || !eventDetails) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 text-center font-sans">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Event Not Available</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {error || "This booking link may have expired or been deactivated by the host."}
        </p>
        <Button asChild size="sm" className="mt-6">
          <Link href={`/public/${username}`}>View Host Profile</Link>
        </Button>
      </div>
    );
  }

  // Calendar calculations (Monday start to match Calendly)
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  // Monday start: 0 = Mon, ..., 6 = Sun
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  const daysMatrix = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysMatrix.push(null);
  }
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const formatted = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    daysMatrix.push({ day, dateString: formatted });
  }

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(currentMonth);

  const formattedSelectedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: attendeeTimezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${selectedDate}T12:00:00Z`));

  const handleCopyLink = async () => {
    if (typeof window !== "undefined") {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied", "Booking page link copied to clipboard.");
      } catch {
        toast.error("Copy failed", "Could not copy link to clipboard.");
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-neutral-100/70 font-sans text-neutral-900 selection:bg-blue-600 selection:text-white">
      {/* Top Bar with Home and Copy Link */}
      <header className="w-full max-w-[1100px] mx-auto px-4 pt-6 pb-2 flex items-center justify-between">
        <Link
          href={`/public/${username}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors duration-150 group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform duration-150" />
          <span>All events with {eventDetails.host.name}</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Home Link */}
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 px-3 py-1.5 rounded-lg hover:bg-white/60 transition-colors"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>

          {/* Copy Link Button */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-full px-3.5 py-1.5 hover:bg-neutral-50 shadow-2xs transition-all cursor-pointer"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>Copy link</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col justify-center items-center py-4 px-4 sm:px-6 w-full">
        <div className="w-full max-w-[1100px] my-auto">
          {/* Mobile Tab Stepper */}
          <div className="flex md:hidden items-center justify-between border-b border-neutral-200 pb-2 mb-3 gap-2">
            <button
              type="button"
              onClick={() => setMobileStep("date")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                mobileStep === "date"
                  ? "bg-white text-neutral-900 font-semibold shadow-xs"
                  : "text-neutral-500"
              }`}
            >
              1. Date
            </button>
            <button
              type="button"
              onClick={() => setMobileStep("slots")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                mobileStep === "slots"
                  ? "bg-white text-neutral-900 font-semibold shadow-xs"
                  : "text-neutral-500"
              }`}
            >
              2. Slot ({slots.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileStep("details")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                mobileStep === "details"
                  ? "bg-white text-neutral-900 font-semibold shadow-xs"
                  : "text-neutral-500"
              }`}
            >
              3. Details
            </button>
          </div>

          {/* Main Calendly Card Shell */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white shadow-lg min-h-[580px] sm:min-h-[620px] grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-neutral-200">
            {/* Top-Right Powered By Ribbon */}
            <div className="absolute top-0 right-0 w-28 h-28 overflow-hidden rounded-tr-2xl pointer-events-none z-10 select-none">
              <div className="absolute transform rotate-45 bg-neutral-700/90 text-white text-[8px] font-bold uppercase tracking-wider py-1.5 right-[-34px] top-[22px] w-[130px] text-center shadow-md">
                <span className="block text-[6px] font-normal tracking-widest text-neutral-300 -mb-0.5">
                  POWERED BY
                </span>
                Sched
              </div>
            </div>

            {/* Left Column: Host & Event Details (3 cols) */}
            <div className="p-7 sm:p-8 lg:col-span-3 flex flex-col justify-start space-y-6">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    {eventDetails.host.name}
                  </p>
                  <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-neutral-900 mt-1">
                    {eventDetails.title}
                  </h1>
                </div>

                <div className="space-y-2.5 text-sm font-semibold text-neutral-600">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-neutral-500 shrink-0" />
                    <span>{eventDetails.durationMinutes} min</span>
                  </div>

                  {/* Location Badge */}
                  {eventDetails.location && (
                    <div className="flex items-center gap-2 text-xs font-medium text-neutral-700">
                      {eventDetails.location.type === "ZOOM" && (
                        <>
                          <ZoomLogo className="h-4 w-4 shrink-0" />
                          <span>Zoom Video (details provided upon confirmation)</span>
                        </>
                      )}
                      {eventDetails.location.type === "IN_PERSON" && (
                        <>
                          <MapPin className="h-4 w-4 text-neutral-500 shrink-0" />
                          <span>In-Person{eventDetails.location.publicAddress ? `: ${eventDetails.location.publicAddress}` : ""}</span>
                        </>
                      )}
                      {eventDetails.location.type === "STATIC_VIDEO" && (
                        <>
                          <Video className="h-4 w-4 text-neutral-500 shrink-0" />
                          <span>Web conferencing details provided upon confirmation</span>
                        </>
                      )}
                      {eventDetails.location.type === "CUSTOM_LINK" && (
                        <>
                          <Link2 className="h-4 w-4 text-neutral-500 shrink-0" />
                          <span>Web Conference</span>
                        </>
                      )}
                      {eventDetails.location.type === "HOST_CALLS_ATTENDEE" && (
                        <>
                          <PhoneCall className="h-4 w-4 text-neutral-500 shrink-0" />
                          <span>Phone call</span>
                        </>
                      )}
                      {eventDetails.location.type === "ATTENDEE_CALLS_HOST" && (
                        <>
                          <PhoneForwarded className="h-4 w-4 text-neutral-500 shrink-0" />
                          <span>Phone call (attendee calls host)</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {eventDetails.description && (
                  <p className="text-xs text-neutral-600 leading-relaxed pt-3 whitespace-pre-wrap">
                    {eventDetails.description}
                  </p>
                )}
              </div>
            </div>

            {/* Middle Column: Calendar & Timezone (Expanded to 5 cols) */}
            <div
              className={`p-7 sm:p-8 lg:col-span-5 flex flex-col justify-start space-y-6 ${
                mobileStep !== "date" ? "hidden md:flex" : "flex"
              }`}
            >
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-neutral-900">
                  Select a Date & Time
                </h2>

                {/* Month Selector */}
                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevMonth}
                    className="h-8 w-8 text-neutral-600 hover:text-blue-600 cursor-pointer"
                    title="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <h3
                    key={`title-${currentMonth.getFullYear()}-${currentMonth.getMonth()}`}
                    className="text-sm font-bold text-neutral-900 animate-in fade-in-0 duration-200"
                  >
                    {monthName}
                  </h3>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleNextMonth}
                    className="h-8 w-8 text-neutral-600 hover:text-blue-600 cursor-pointer"
                    title="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Weekday Labels (Mon - Sun) */}
                <div className="grid grid-cols-7 gap-2 text-center font-medium text-[11px] sm:text-xs text-neutral-500 mb-2 pb-1">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName) => (
                    <div key={dayName} className="py-1">
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Days Grid with Generous Gaps and Circular Badges */}
                <div className="overflow-hidden py-3 px-1.5">
                  <div
                    key={`grid-${currentMonth.getFullYear()}-${currentMonth.getMonth()}`}
                    className={`grid grid-cols-7 gap-x-2.5 sm:gap-x-3.5 gap-y-3.5 sm:gap-y-4 text-center ${
                      slideDirection === "next"
                        ? "animate-in fade-in-0 slide-in-from-right-4 duration-200 ease-out"
                        : slideDirection === "prev"
                        ? "animate-in fade-in-0 slide-in-from-left-4 duration-200 ease-out"
                        : "animate-in fade-in-0 duration-150"
                    }`}
                  >
                    {daysMatrix.map((item, idx) => {
                      if (!item) {
                        return <div key={`empty-${idx}`} className="h-10 w-10 sm:h-11 sm:w-11 mx-auto" />;
                      }

                      const isSelected = selectedDate === item.dateString;
                      const isPast =
                        new Date(`${item.dateString}T23:59:59`).getTime() < new Date().setHours(0, 0, 0, 0);

                      return (
                        <button
                          key={item.dateString}
                          type="button"
                          disabled={isPast}
                          onClick={() => {
                            setSelectedDate(item.dateString);
                            setMobileStep("slots");
                          }}
                          className={`h-10 w-10 sm:h-11 sm:w-11 mx-auto rounded-full text-xs sm:text-sm font-semibold tabular-nums font-sans transition-all duration-150 flex items-center justify-center cursor-pointer ${
                            isSelected
                              ? "bg-blue-600 text-white font-bold shadow-xs scale-105"
                              : isPast
                              ? "text-neutral-400 cursor-not-allowed"
                              : "bg-blue-50/90 hover:bg-blue-100 text-blue-600 font-bold"
                          }`}
                        >
                          {item.day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timezone Section below Calendar */}
                <div className="pt-4 space-y-1.5">
                  <div className="text-xs font-bold text-neutral-800">
                    Time zone
                  </div>
                  <TimezonePicker
                    value={attendeeTimezone}
                    onChange={(newTz) => setAttendeeTimezone(newTz)}
                    variant="inline"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Time Slots & Attendee Booking Form (4 cols) */}
            <div
              className={`p-7 sm:p-8 lg:col-span-4 space-y-5 ${
                mobileStep === "date" ? "hidden md:block" : "block"
              }`}
            >
              <div>
                <h3 className="text-sm font-medium text-neutral-800">
                  {formattedSelectedDate}
                </h3>
              </div>

              {/* Duplicate Booking Detected Dialog or Slots / Form */}
              {existingBookingDuplicate ? (
                <div className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 animate-in fade-in-0 duration-150">
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-neutral-900">
                      You already have a booking for this meeting.
                    </h3>
                    <div className="pt-2 text-xs space-y-1 text-neutral-600">
                      <p className="font-semibold text-neutral-900">Existing booking:</p>
                      <p>
                        <span className="text-neutral-500">Date: </span>
                        <span className="font-medium text-neutral-900">
                          {new Intl.DateTimeFormat("en-US", {
                            timeZone: attendeeTimezone,
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          }).format(new Date(existingBookingDuplicate.startTime))}
                        </span>
                      </p>
                      <p>
                        <span className="text-neutral-500">Time: </span>
                        <span className="font-medium text-neutral-900">
                          {new Intl.DateTimeFormat("en-US", {
                            timeZone: attendeeTimezone,
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          }).format(new Date(existingBookingDuplicate.startTime))} ({attendeeTimezone})
                        </span>
                      </p>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-neutral-900 pt-2 border-t border-neutral-200">
                    What would you like to do?
                  </p>

                  <div className="space-y-2">
                    <Button asChild className="w-full" size="sm">
                      <Link href={existingBookingDuplicate.manageUrl}>View Existing Booking</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      size="sm"
                      onClick={() => {
                        setExistingBookingDuplicate(null);
                        setSelectedSlot(null);
                      }}
                    >
                      Choose Another Time
                    </Button>
                    <Button asChild variant="outline" className="w-full" size="sm">
                      <Link href={`${existingBookingDuplicate.manageUrl}&action=reschedule`}>
                        Reschedule Existing Booking
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : !selectedSlot ? (
                <div className="space-y-3">
                  {slotConflictMessage && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                      <p className="font-semibold">{slotConflictMessage}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSlotConflictMessage(null);
                          void loadSlots();
                        }}
                        className="w-full text-xs h-8"
                      >
                        Choose Another Time
                      </Button>
                    </div>
                  )}

                  {isLoadingSlots ? (
                    <div className="space-y-2.5">
                      <Skeleton className="h-12 w-full rounded-lg" />
                      <Skeleton className="h-12 w-full rounded-lg" />
                      <Skeleton className="h-12 w-full rounded-lg" />
                      <Skeleton className="h-12 w-full rounded-lg" />
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
                      <p className="text-xs text-neutral-500">
                        No available slots on this day. Please choose another date on the calendar.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1.5">
                      {slots.map((slot) => {
                        const dateObj = new Date(slot.startUtc);
                        const slotTimeStr = new Intl.DateTimeFormat("en-US", {
                          timeZone: attendeeTimezone,
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        }).format(dateObj);

                        return (
                          <button
                            key={slot.startUtc}
                            type="button"
                            onClick={() => {
                              setSelectedSlot(slot);
                              setMobileStep("details");
                            }}
                            className="w-full h-12 flex items-center justify-center rounded-lg border-2 border-blue-500 hover:border-blue-600 bg-white text-blue-600 hover:bg-blue-50/50 text-sm font-bold transition-all duration-150 cursor-pointer shadow-2xs group"
                          >
                            <span className="tabular-nums font-sans">{slotTimeStr}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Details Submission Form */
                <form onSubmit={handleBookSubmit} className="space-y-4 animate-in fade-in-0 duration-150">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-neutral-900">
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: attendeeTimezone,
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        }).format(new Date(selectedSlot.startUtc))}
                      </p>
                      <p className="text-[11px] text-neutral-500 font-mono">
                        {formattedSelectedDate}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSlot(null)}
                      className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      Change slot
                    </button>
                  </div>

                  {/* Name */}
                  <div className="space-y-1">
                    <Label htmlFor="attendeeName">Your Name</Label>
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                      <Input
                        id="attendeeName"
                        value={attendeeName}
                        onChange={(e) => setAttendeeName(e.target.value)}
                        placeholder="Jane Doe"
                        required
                        className="pl-8 bg-white"
                        aria-invalid={Boolean(fieldValidationErrors.attendeeName)}
                      />
                    </div>
                    {fieldValidationErrors.attendeeName && (
                      <p className="text-[11px] text-red-500">
                        {fieldValidationErrors.attendeeName}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <Label htmlFor="attendeeEmail">Your Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                      <Input
                        id="attendeeEmail"
                        type="email"
                        value={attendeeEmail}
                        onChange={(e) => setAttendeeEmail(e.target.value)}
                        placeholder="jane@company.com"
                        required
                        className="pl-8 bg-white"
                        aria-invalid={Boolean(fieldValidationErrors.attendeeEmail)}
                      />
                    </div>
                    {fieldValidationErrors.attendeeEmail && (
                      <p className="text-[11px] text-red-500">
                        {fieldValidationErrors.attendeeEmail}
                      </p>
                    )}
                  </div>

                  {/* Attendee Phone Number if HOST_CALLS_ATTENDEE */}
                  {eventDetails.location?.type === "HOST_CALLS_ATTENDEE" && (
                    <div className="space-y-1">
                      <Label htmlFor="attendeePhone">Your Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                        <Input
                          id="attendeePhone"
                          type="tel"
                          value={attendeePhone}
                          onChange={(e) => setAttendeePhone(e.target.value)}
                          placeholder="+14155552671"
                          required
                          className="pl-8 font-mono text-xs bg-white"
                          aria-invalid={Boolean(fieldValidationErrors.attendeePhoneNumber)}
                        />
                      </div>
                      <p className="text-[10px] text-neutral-500">
                        Include country code (e.g. +14155552671). The host will dial you directly.
                      </p>
                      {fieldValidationErrors.attendeePhoneNumber && (
                        <p className="text-[11px] text-red-500">
                          {fieldValidationErrors.attendeePhoneNumber}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Custom Questions */}
                  {eventDetails.customQuestions && eventDetails.customQuestions.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-neutral-200">
                      {eventDetails.customQuestions.map((q) => {
                        const val = customAnswers[q.id];

                        if (q.type === "TEXT") {
                          return (
                            <div key={q.id} className="space-y-1">
                              <Label htmlFor={`q_${q.id}`}>
                                {q.label}{" "}
                                {q.required && <span className="text-red-500">*</span>}
                              </Label>
                              <Input
                                id={`q_${q.id}`}
                                value={typeof val === "string" ? val : ""}
                                onChange={(e) => setCustomAnswer(q.id, e.target.value)}
                                placeholder={q.placeholder || ""}
                                required={q.required}
                                className="bg-white"
                              />
                            </div>
                          );
                        }

                        if (q.type === "TEXTAREA") {
                          return (
                            <div key={q.id} className="space-y-1">
                              <Label htmlFor={`q_${q.id}`}>
                                {q.label}{" "}
                                {q.required && <span className="text-red-500">*</span>}
                              </Label>
                              <Textarea
                                id={`q_${q.id}`}
                                value={typeof val === "string" ? val : ""}
                                onChange={(e) => setCustomAnswer(q.id, e.target.value)}
                                placeholder={q.placeholder || ""}
                                required={q.required}
                                rows={2}
                                className="bg-white"
                              />
                            </div>
                          );
                        }

                        if (q.type === "SELECT") {
                          return (
                            <div key={q.id} className="space-y-1">
                              <Label htmlFor={`q_${q.id}`}>
                                {q.label}{" "}
                                {q.required && <span className="text-red-500">*</span>}
                              </Label>
                              <select
                                id={`q_${q.id}`}
                                value={typeof val === "string" ? val : ""}
                                onChange={(e) => setCustomAnswer(q.id, e.target.value)}
                                required={q.required}
                                className="w-full h-9 rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-900 shadow-xs focus:border-blue-600 focus:outline-none"
                              >
                                <option value="">Select an option...</option>
                                {q.options.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        }

                        if (q.type === "CHECKBOX") {
                          return (
                            <div key={q.id} className="pt-1">
                              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  id={`q_${q.id}`}
                                  checked={Boolean(val)}
                                  onChange={(e) => setCustomAnswer(q.id, e.target.checked)}
                                  required={q.required}
                                  className="mt-0.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600 h-4 w-4"
                                />
                                <span className="text-xs text-neutral-900 leading-tight">
                                  {q.label}{" "}
                                  {q.required && <span className="text-red-500">*</span>}
                                </span>
                              </label>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-1">
                    <Label htmlFor="attendeeNotes">Notes / Agenda (Optional)</Label>
                    <Textarea
                      id="attendeeNotes"
                      value={attendeeNotes}
                      onChange={(e) => setAttendeeNotes(e.target.value)}
                      placeholder="Briefly share what you would like to discuss..."
                      rows={3}
                      className="bg-white"
                    />
                  </div>

                  <Button type="submit" disabled={isSubmitting} className="w-full mt-2 gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    {isSubmitting ? (
                      <>
                        <Spinner size="sm" />
                        <span>Reserving Slot…</span>
                      </>
                    ) : (
                      <span>Schedule Meeting</span>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-700 transition-colors duration-150"
        >
          <span>Powered by</span>
          <Logo className="h-4 w-4" />
          <span className="font-semibold text-neutral-600">Sched</span>
        </Link>
      </footer>
    </div>
  );
}
