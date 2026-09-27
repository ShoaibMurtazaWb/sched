"use client";

import { use, useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  User,
  MapPin,
  Video,
  PhoneCall,
  Link2,
  Home,
  ChevronDown,
  Check,
  Calendar as CalendarIcon,
  Globe,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
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
    avatarUrl?: string | null;
  };
}

type BookingStep = "date" | "slots" | "details";

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

  // Top navigation menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Timezone state
  const [attendeeTimezone, setAttendeeTimezone] = useState<string>("UTC");

  // Step state: 'date' -> 'slots' -> 'details'
  const [step, setStep] = useState<BookingStep>("date");

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
  const [customAnswers, setCustomAnswers] = useState<Record<string, string | boolean | string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldValidationErrors, setFieldValidationErrors] = useState<Record<string, string>>({});

  const setCustomAnswer = (qId: string, val: string | boolean | string[]) => {
    setCustomAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

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

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleCopyLink = async () => {
    if (typeof window !== "undefined") {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedLink(true);
        toast.success("Link copied", "Booking page link copied to clipboard.");
        setTimeout(() => setCopiedLink(false), 2000);
      } catch {
        toast.error("Copy failed", "Could not copy link to clipboard.");
      }
    }
  };

  const handleBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      toast.error("Slot Required", "Please select an available time slot first.");
      return;
    }

    if (eventDetails?.customQuestions) {
      for (const q of eventDetails.customQuestions) {
        if (q.required && q.type === "SELECT" && q.allowMultiple) {
          const ans = customAnswers[q.id];
          const hasSelected = Array.isArray(ans) ? ans.length > 0 : Boolean(ans);
          if (!hasSelected) {
            setIsSubmitting(false);
            toast.error("Required Question", `Please select at least one option for "${q.label}".`);
            return;
          }
        }
      }
    }

    setIsSubmitting(true);
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
          setStep("slots");
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

  // Calendar calculations (Monday start to match Calendly)
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
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

  // Formatted date representations
  const selectedDateObj = new Date(`${selectedDate}T12:00:00Z`);

  const dayOfWeekName = new Intl.DateTimeFormat("en-US", {
    timeZone: attendeeTimezone,
    weekday: "long",
  }).format(selectedDateObj);

  const fullMonthDayYear = new Intl.DateTimeFormat("en-US", {
    timeZone: attendeeTimezone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(selectedDateObj);

  // Formatted time range when slot selected
  const slotTimeRange = useMemo(() => {
    if (!selectedSlot || !eventDetails) return "";
    const slotStart = new Date(selectedSlot.startUtc);
    const slotEnd = new Date(slotStart.getTime() + eventDetails.durationMinutes * 60000);
    const startStr = new Intl.DateTimeFormat("en-US", {
      timeZone: attendeeTimezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(slotStart).toLowerCase();
    const endStr = new Intl.DateTimeFormat("en-US", {
      timeZone: attendeeTimezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(slotEnd).toLowerCase();
    return `${startStr} - ${endStr}`;
  }, [selectedSlot, eventDetails, attendeeTimezone]);

  const slotFullDate = useMemo(() => {
    if (!selectedSlot) return "";
    const slotStart = new Date(selectedSlot.startUtc);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: attendeeTimezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(slotStart);
  }, [selectedSlot, attendeeTimezone]);

  if (isLoadingEvent) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <Skeleton className="h-6 w-32 rounded-md" />
          <Skeleton className="h-10 w-48 rounded-md" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !eventDetails) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center font-sans">
        <h1 className="text-xl font-bold text-neutral-900">Event Not Available</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {error || "This booking link may have expired or been deactivated by the host."}
        </p>
        <Button asChild size="sm" className="mt-6 rounded-full">
          <Link href={`/public/${username}`}>View Host Profile</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-neutral-900 selection:bg-blue-600 selection:text-white flex flex-col justify-between relative overflow-x-hidden">
      {/* Top-Right Powered By Diagonal Ribbon (matching Calendly exact aesthetic) */}
      <div className="absolute top-0 right-0 w-28 h-28 overflow-hidden pointer-events-none z-20 select-none">
        <div className="absolute transform rotate-45 bg-[#4D5055] text-white text-[8px] font-bold uppercase tracking-wider py-1.5 right-[-34px] top-[22px] w-[130px] text-center shadow-md">
          <span className="block text-[6px] font-normal tracking-widest text-neutral-300 -mb-0.5">
            POWERED BY
          </span>
          Sched
        </div>
      </div>

      {/* Top Header Row (Back button / Menu on left, Copy Link on right) */}
      <header className="w-full max-w-[440px] sm:max-w-[480px] md:max-w-[540px] mx-auto px-5 pt-4 pb-2 flex items-center justify-between z-10">
        <div>
          {step === "date" ? (
            /* Menu Dropdown */
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-neutral-700 hover:text-blue-600 py-1.5 transition-colors cursor-pointer"
              >
                <span>Menu</span>
                <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
              </button>
              {isMenuOpen && (
                <div className="absolute left-0 mt-2 w-48 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                  <Link
                    href={`/public/${username}`}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                  >
                    <User className="h-3.5 w-3.5 text-neutral-500" />
                    <span>Host profile</span>
                  </Link>
                  <Link
                    href={homeHref}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
                  >
                    <Home className="h-3.5 w-3.5 text-neutral-500" />
                    <span>Home</span>
                  </Link>
                </div>
              )}
            </div>
          ) : step === "slots" ? (
            /* Back to Date button */
            <button
              type="button"
              onClick={() => {
                setStep("date");
                setSelectedSlot(null);
                setSlotConflictMessage(null);
              }}
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 flex items-center justify-center text-blue-600 transition-all cursor-pointer shadow-2xs group"
              title="Back to calendar"
              aria-label="Back to calendar"
            >
              <ArrowLeft className="h-4 w-4 stroke-[2.5] group-hover:-translate-x-0.5 transition-transform" />
            </button>
          ) : (
            /* Back to Slots button */
            <button
              type="button"
              onClick={() => {
                setStep("slots");
                setSelectedSlot(null);
              }}
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 flex items-center justify-center text-blue-600 transition-all cursor-pointer shadow-2xs group"
              title="Back to times"
              aria-label="Back to times"
            >
              <ArrowLeft className="h-4 w-4 stroke-[2.5] group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* Copy Link Button */}
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 bg-white border border-neutral-300 rounded-full px-3.5 py-1.5 hover:bg-neutral-50 shadow-2xs transition-all cursor-pointer mr-12 sm:mr-14"
        >
          {copiedLink ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Link2 className="h-3.5 w-3.5 text-neutral-600" />
              <span>Copy link</span>
            </>
          )}
        </button>
      </header>

      {/* Main Booking Content (Unified Base - Same as page background, no nested contrasting card) */}
      <main className="flex-1 w-full max-w-[440px] sm:max-w-[480px] md:max-w-[540px] mx-auto px-5 py-4 flex flex-col justify-start">
        {/* STEP 1: SELECT A DAY */}
        {step === "date" && (
          <div className="space-y-6 animate-in fade-in-0 duration-200">
            {/* Host & Event Info Header */}
            <div className="text-center pt-2 space-y-3">
              <p className="text-sm font-bold text-neutral-600">
                {eventDetails.host.name}
              </p>
              <h1 className="text-2xl sm:text-[28px] font-extrabold text-[#0B2545] tracking-tight">
                {eventDetails.title}
              </h1>

              <div className="flex flex-col items-center gap-2 pt-1 text-xs sm:text-sm font-semibold text-neutral-700">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-neutral-800 shrink-0" />
                  <span>{eventDetails.durationMinutes} min</span>
                </div>

                {eventDetails.location && (
                  <div className="flex items-center justify-center gap-2 text-center text-xs font-medium text-neutral-700 max-w-sm">
                    {eventDetails.location.type === "ZOOM" && (
                      <>
                        <Video className="h-4 w-4 text-neutral-800 shrink-0" />
                        <span>Web conferencing details provided upon confirmation.</span>
                      </>
                    )}
                    {eventDetails.location.type === "IN_PERSON" && (
                      <>
                        <MapPin className="h-4 w-4 text-neutral-800 shrink-0" />
                        <span>In-Person{eventDetails.location.publicAddress ? `: ${eventDetails.location.publicAddress}` : ""}</span>
                      </>
                    )}
                    {(eventDetails.location.type === "STATIC_VIDEO" || eventDetails.location.type === "CUSTOM_LINK") && (
                      <>
                        <Video className="h-4 w-4 text-neutral-800 shrink-0" />
                        <span>Web conferencing details provided upon confirmation.</span>
                      </>
                    )}
                    {(eventDetails.location.type === "HOST_CALLS_ATTENDEE" || eventDetails.location.type === "ATTENDEE_CALLS_HOST") && (
                      <>
                        <PhoneCall className="h-4 w-4 text-neutral-800 shrink-0" />
                        <span>Phone call</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {Boolean(eventDetails.description?.trim()) && (
                <p className="text-xs text-neutral-600 leading-relaxed pt-1 max-w-sm mx-auto whitespace-pre-wrap">
                  {eventDetails.description.trim()}
                </p>
              )}
            </div>

            {/* Subtle Divider */}
            <div className="border-b border-neutral-100 w-full pt-1" />

            {/* Select a Day Title */}
            <div className="text-center pt-1">
              <h2 className="text-xl sm:text-2xl font-bold text-[#0B2545] tracking-tight">
                Select a Day
              </h2>
            </div>

            {/* Month Navigator */}
            <div className="flex items-center justify-between px-6 pt-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="h-8 w-8 flex items-center justify-center rounded-full text-neutral-700 hover:text-blue-600 hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <h3 className="text-sm sm:text-base font-bold text-[#0B2545]">
                {monthName}
              </h3>

              <button
                type="button"
                onClick={handleNextMonth}
                className="h-8 w-8 flex items-center justify-center rounded-full text-neutral-700 hover:text-blue-600 hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Weekdays Row */}
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-neutral-600 px-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Days Matrix */}
            <div className="grid grid-cols-7 gap-x-2 gap-y-3.5 text-center px-1">
              {daysMatrix.map((item, idx) => {
                if (!item) {
                  return <div key={`empty-${idx}`} className="h-10 w-10 mx-auto" />;
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
                      setStep("slots");
                    }}
                    className={`h-10 w-10 sm:h-11 sm:w-11 mx-auto rounded-full text-xs sm:text-sm font-semibold tabular-nums transition-all flex items-center justify-center cursor-pointer ${
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

            {/* Time zone picker below calendar */}
            <div className="pt-6 space-y-1.5 text-center sm:text-left">
              <div className="text-xs font-bold text-neutral-900">
                Time zone
              </div>
              <TimezonePicker
                value={attendeeTimezone}
                onChange={(newTz) => setAttendeeTimezone(newTz)}
                variant="inline"
              />
            </div>
          </div>
        )}

        {/* STEP 2: SELECT A TIME */}
        {step === "slots" && (
          <div className="space-y-6 animate-in fade-in-0 duration-200">
            {/* Header info */}
            <div className="text-center pt-2 space-y-1">
              <h1 className="text-2xl sm:text-[26px] font-bold text-[#0B2545] tracking-tight">
                {dayOfWeekName}
              </h1>
              <p className="text-xs sm:text-sm text-neutral-600 font-medium">
                {fullMonthDayYear}
              </p>

              <div className="pt-2 flex justify-center">
                <div className="text-xs text-neutral-700">
                  <span className="font-semibold text-neutral-800 mr-1.5">Time zone</span>
                  <TimezonePicker
                    value={attendeeTimezone}
                    onChange={(newTz) => setAttendeeTimezone(newTz)}
                    variant="inline"
                  />
                </div>
              </div>
            </div>

            {/* Subtle Divider */}
            <div className="border-b border-neutral-100 w-full" />

            {/* Select a Time Heading */}
            <div className="text-center space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-[#0B2545]">
                Select a Time
              </h2>
              <p className="text-xs text-neutral-500 font-medium">
                Duration: {eventDetails.durationMinutes} min
              </p>
            </div>

            {/* Conflict Alert (if any) */}
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
                  Refresh Slots
                </Button>
              </div>
            )}

            {/* Slots List Matching Reference Screenshot 2 & 3 */}
            {isLoadingSlots ? (
              <div className="space-y-2.5 pt-1">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center space-y-3">
                <p className="text-xs text-neutral-500">
                  No available time slots on this day.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("date")}
                  className="text-xs rounded-full"
                >
                  Choose another day
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {slots.map((slot) => {
                  const dateObj = new Date(slot.startUtc);
                  const slotTimeStr = new Intl.DateTimeFormat("en-US", {
                    timeZone: attendeeTimezone,
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  }).format(dateObj).toLowerCase();

                  return (
                    <button
                      key={slot.startUtc}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setStep("details");
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
        )}

        {/* STEP 3: ENTER DETAILS */}
        {step === "details" && selectedSlot && (
          <div className="space-y-6 animate-in fade-in-0 duration-200">
            {/* Duplicate Booking Warning */}
            {existingBookingDuplicate ? (
              <div className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
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

                <div className="space-y-2 pt-2">
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
                      setStep("slots");
                    }}
                  >
                    Choose Another Time
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Meeting Summary Header Matching Reference Screenshot 4 */}
                <div className="space-y-3 pt-2">
                  <h1 className="text-2xl sm:text-[28px] font-extrabold text-[#0B2545] tracking-tight">
                    {eventDetails.title}
                  </h1>

                  <div className="space-y-2 text-xs sm:text-sm font-semibold text-neutral-700">
                    <div className="flex items-center gap-2.5">
                      <Clock className="h-4 w-4 text-neutral-800 shrink-0" />
                      <span>{eventDetails.durationMinutes} min</span>
                    </div>

                    {eventDetails.location && (
                      <div className="flex items-center gap-2.5 text-neutral-700">
                        {eventDetails.location.type === "ZOOM" && (
                          <>
                            <Video className="h-4 w-4 text-neutral-800 shrink-0" />
                            <span>Web conferencing details provided upon confirmation.</span>
                          </>
                        )}
                        {eventDetails.location.type === "IN_PERSON" && (
                          <>
                            <MapPin className="h-4 w-4 text-neutral-800 shrink-0" />
                            <span>In-Person{eventDetails.location.publicAddress ? `: ${eventDetails.location.publicAddress}` : ""}</span>
                          </>
                        )}
                        {(eventDetails.location.type === "STATIC_VIDEO" || eventDetails.location.type === "CUSTOM_LINK") && (
                          <>
                            <Video className="h-4 w-4 text-neutral-800 shrink-0" />
                            <span>Web conferencing details provided upon confirmation.</span>
                          </>
                        )}
                        {(eventDetails.location.type === "HOST_CALLS_ATTENDEE" || eventDetails.location.type === "ATTENDEE_CALLS_HOST") && (
                          <>
                            <PhoneCall className="h-4 w-4 text-neutral-800 shrink-0" />
                            <span>Phone call</span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2.5">
                      <CalendarIcon className="h-4 w-4 text-neutral-800 shrink-0" />
                      <span>{slotTimeRange}, {slotFullDate}</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Globe className="h-4 w-4 text-neutral-800 shrink-0" />
                      <span>{attendeeTimezone}</span>
                    </div>
                  </div>
                </div>

                {/* Subtle Divider */}
                <div className="border-b border-neutral-100 w-full" />

                {/* Details Form Matching Reference Screenshot 4 */}
                <form onSubmit={handleBookSubmit} className="space-y-4">
                  <h2 className="text-xl font-bold text-[#0B2545] pb-1">
                    Enter Details
                  </h2>

                  {/* Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="attendeeName" className="text-xs font-bold text-neutral-800">
                      Name *
                    </Label>
                    <Input
                      id="attendeeName"
                      value={attendeeName}
                      onChange={(e) => setAttendeeName(e.target.value)}
                      placeholder="Shoaib Murtaza"
                      required
                      className="h-11 rounded-lg border-neutral-300 bg-white text-xs font-medium focus:border-blue-600 focus:ring-blue-600"
                      aria-invalid={Boolean(fieldValidationErrors.attendeeName)}
                    />
                    {fieldValidationErrors.attendeeName && (
                      <p className="text-[11px] text-red-500">
                        {fieldValidationErrors.attendeeName}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="attendeeEmail" className="text-xs font-bold text-neutral-800">
                      Email *
                    </Label>
                    <Input
                      id="attendeeEmail"
                      type="email"
                      value={attendeeEmail}
                      onChange={(e) => setAttendeeEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                      className="h-11 rounded-lg border-neutral-300 bg-white text-xs font-medium focus:border-blue-600 focus:ring-blue-600"
                      aria-invalid={Boolean(fieldValidationErrors.attendeeEmail)}
                    />
                    {fieldValidationErrors.attendeeEmail && (
                      <p className="text-[11px] text-red-500">
                        {fieldValidationErrors.attendeeEmail}
                      </p>
                    )}
                  </div>

                  {/* Phone (if required) */}
                  {eventDetails.location?.type === "HOST_CALLS_ATTENDEE" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="attendeePhone" className="text-xs font-bold text-neutral-800">
                        Phone Number *
                      </Label>
                      <Input
                        id="attendeePhone"
                        type="tel"
                        value={attendeePhone}
                        onChange={(e) => setAttendeePhone(e.target.value)}
                        placeholder="+92 300 1234567"
                        required
                        className="h-11 rounded-lg border-neutral-300 bg-white text-xs font-medium focus:border-blue-600 focus:ring-blue-600"
                        aria-invalid={Boolean(fieldValidationErrors.attendeePhoneNumber)}
                      />
                      {fieldValidationErrors.attendeePhoneNumber && (
                        <p className="text-[11px] text-red-500">
                          {fieldValidationErrors.attendeePhoneNumber}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Custom Questions */}
                  {eventDetails.customQuestions && eventDetails.customQuestions.length > 0 && (
                    <div className="space-y-4 pt-1">
                      {eventDetails.customQuestions.map((q) => {
                        const val = customAnswers[q.id];

                        if (q.type === "TEXT") {
                          return (
                            <div key={q.id} className="space-y-1.5">
                              <Label htmlFor={`q_${q.id}`} className="text-xs font-bold text-neutral-800">
                                {q.label} {q.required && <span className="text-red-500">*</span>}
                              </Label>
                              <Input
                                id={`q_${q.id}`}
                                value={typeof val === "string" ? val : ""}
                                onChange={(e) => setCustomAnswer(q.id, e.target.value)}
                                placeholder={q.placeholder || ""}
                                required={q.required}
                                className="h-11 rounded-lg border-neutral-300 bg-white text-xs font-medium"
                              />
                            </div>
                          );
                        }

                        if (q.type === "TEXTAREA") {
                          return (
                            <div key={q.id} className="space-y-1.5">
                              <Label htmlFor={`q_${q.id}`} className="text-xs font-bold text-neutral-800">
                                {q.label} {q.required && <span className="text-red-500">*</span>}
                              </Label>
                              <Textarea
                                id={`q_${q.id}`}
                                value={typeof val === "string" ? val : ""}
                                onChange={(e) => setCustomAnswer(q.id, e.target.value)}
                                placeholder={q.placeholder || ""}
                                required={q.required}
                                rows={2}
                                className="rounded-lg border-neutral-300 bg-white text-xs font-medium"
                              />
                            </div>
                          );
                        }

                        if (q.type === "SELECT") {
                          if (q.allowMultiple) {
                            const selectedArray: string[] = Array.isArray(val)
                              ? val
                              : typeof val === "string" && val
                              ? val.split(",").map((s) => s.trim()).filter(Boolean)
                              : [];

                            const handleToggle = (optId: string) => {
                              const next = selectedArray.includes(optId)
                                ? selectedArray.filter((id) => id !== optId)
                                : [...selectedArray, optId];
                              setCustomAnswer(q.id, next);
                            };

                            return (
                              <div key={q.id} className="space-y-1.5">
                                <Label className="text-xs font-bold text-neutral-800">
                                  {q.label} {q.required && <span className="text-red-500">*</span>}
                                </Label>
                                <div className="space-y-2 pt-0.5">
                                  {q.options?.map((opt) => (
                                    <label
                                      key={opt.id}
                                      className="flex items-center gap-2.5 text-xs text-neutral-800 cursor-pointer font-medium"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedArray.includes(opt.id)}
                                        onChange={() => handleToggle(opt.id)}
                                        className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      <span>{opt.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={q.id} className="space-y-1.5">
                              <Label htmlFor={`q_${q.id}`} className="text-xs font-bold text-neutral-800">
                                {q.label} {q.required && <span className="text-red-500">*</span>}
                              </Label>
                              <select
                                id={`q_${q.id}`}
                                value={typeof val === "string" ? val : ""}
                                onChange={(e) => setCustomAnswer(q.id, e.target.value)}
                                required={q.required}
                                className="w-full h-11 px-3 rounded-lg border border-neutral-300 bg-white text-xs font-medium text-neutral-900 focus:border-blue-600 focus:outline-none"
                              >
                                <option value="">Select an option...</option>
                                {q.options?.map((opt) => (
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
                            <div key={q.id} className="flex items-start gap-2.5 pt-1">
                              <input
                                type="checkbox"
                                id={`q_${q.id}`}
                                checked={Boolean(val)}
                                onChange={(e) => setCustomAnswer(q.id, e.target.checked)}
                                required={q.required}
                                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                              />
                              <Label htmlFor={`q_${q.id}`} className="text-xs font-medium text-neutral-800 cursor-pointer leading-tight">
                                {q.label} {q.required && <span className="text-red-500">*</span>}
                              </Label>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  )}

                  {/* Notes / Agenda */}
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="attendeeNotes" className="text-xs font-bold text-neutral-800">
                      Please share anything that will help prepare for our meeting.
                    </Label>
                    <Textarea
                      id="attendeeNotes"
                      value={attendeeNotes}
                      onChange={(e) => setAttendeeNotes(e.target.value)}
                      placeholder=""
                      rows={3}
                      className="rounded-lg border-neutral-300 bg-white text-xs font-medium focus:border-blue-600 focus:ring-blue-600"
                    />
                  </div>

                  {/* Terms and Privacy Notice Matching Screenshot 4 */}
                  <p className="text-[11px] text-neutral-600 leading-relaxed pt-2">
                    By proceeding, you confirm that you have read and agree to{" "}
                    <span className="text-blue-600 font-bold hover:underline cursor-pointer">
                      Sched&apos;s Participant Terms
                    </span>{" "}
                    and{" "}
                    <span className="text-blue-600 font-bold hover:underline cursor-pointer">
                      Privacy Notice
                    </span>
                    .
                  </p>

                  {/* Schedule Event CTA Button Matching Screenshot 4 */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-xs transition-colors cursor-pointer"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <Spinner size="sm" />
                          <span>Scheduling…</span>
                        </span>
                      ) : (
                        <span>Schedule Event</span>
                      )}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer Matching Screenshot (Troubleshoot & Cookie settings) */}
      <footer className="w-full max-w-[440px] sm:max-w-[480px] md:max-w-[540px] mx-auto px-5 pt-8 pb-10 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => toast.info("Troubleshooting", "All scheduling services are active and operational.")}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-neutral-800 text-neutral-800 hover:bg-neutral-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <span>🔧 Troubleshoot</span>
        </button>
        <button
          type="button"
          onClick={() => toast.info("Cookie Settings", "Sched respects your privacy. Essential cookies only are active.")}
          className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
        >
          Cookie settings
        </button>
      </footer>
    </div>
  );
}
