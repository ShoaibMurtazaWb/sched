"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  X,
  Mail,
  Smartphone,
  Globe,
  MapPin,
  Video,
  PhoneCall,
  Clock,
  RefreshCw,
  Trash2,
  ExternalLink,
  User,
  Pencil,
  Calendar,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { BookingResponse } from "@sched/api-contract";

interface BookingDetailDrawerProps {
  booking: BookingResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onReschedule: (booking: BookingResponse) => void;
  onCancel: (booking: BookingResponse) => void;
  onDelete?: (booking: BookingResponse) => void;
}

export function BookingDetailDrawer({
  booking,
  isOpen,
  onClose,
  onReschedule,
  onCancel,
  onDelete,
}: BookingDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"details" | "notes">("details");
  const [isEditEmailOpen, setIsEditEmailOpen] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [displayedBooking, setDisplayedBooking] = useState<BookingResponse | null>(booking);

  useEffect(() => {
    if (booking) {
      setDisplayedBooking(booking);
      setEditEmail(booking.attendeeEmail);
    }
  }, [booking]);

  const currentBooking = booking || displayedBooking;

  if (!currentBooking) {
    return null;
  }

  const startDate = new Date(currentBooking.startTime);
  const endDate = new Date(currentBooking.endTime);
  const createdAtDate = new Date(currentBooking.createdAt);
  const isCancelled = currentBooking.status === "CANCELLED";
  const isPast = new Date(currentBooking.endTime) < new Date() && !isCancelled;
  const isUpcoming = !isPast && !isCancelled;

  // Formatted date representations matching screenshot
  const formattedDayAndDate = new Intl.DateTimeFormat("en-US", {
    timeZone: currentBooking.host.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(startDate);

  const formattedTimeRange = `${new Intl.DateTimeFormat("en-US", {
    timeZone: currentBooking.host.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(startDate).replace(":00", "").toLowerCase()} – ${new Intl.DateTimeFormat("en-US", {
    timeZone: currentBooking.host.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(endDate).toLowerCase()}`;

  const bookedDateFormatted = new Intl.DateTimeFormat("en-US", {
    timeZone: currentBooking.host.timezone,
    day: "numeric",
    month: "long",
  }).format(createdAtDate);

  const bookedTimeFormatted = new Intl.DateTimeFormat("en-US", {
    timeZone: currentBooking.host.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(createdAtDate).toLowerCase().replace(" ", "");

  const startsDateFormatted = new Intl.DateTimeFormat("en-US", {
    timeZone: currentBooking.host.timezone,
    day: "numeric",
    month: "long",
  }).format(startDate);

  const startsTimeFormatted = new Intl.DateTimeFormat("en-US", {
    timeZone: currentBooking.host.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(startDate).toLowerCase().replace(":00", "");

  const tzShort = new Intl.DateTimeFormat("en-US", {
    timeZone: currentBooking.host.timezone,
    timeZoneName: "short",
  }).format(startDate).split(" ").pop() || currentBooking.host.timezone;

  const attendeeInitials = currentBooking.attendeeName
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase() || "A";

  const hostInitial = currentBooking.host.name.charAt(0).toLowerCase() || "h";

  const handleCopyPhone = () => {
    if (!currentBooking.attendeePhoneNumber) return;
    void navigator.clipboard.writeText(currentBooking.attendeePhoneNumber);
    toast.success("Phone number copied to clipboard", currentBooking.attendeePhoneNumber);
  };

  const handleUpdateAttendeeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBooking) return;
    if (!editEmail || !editEmail.includes("@")) {
      toast.error("Invalid email", "Please enter a valid email address.");
      return;
    }

    setIsUpdatingEmail(true);
    try {
      await api(`/bookings/${currentBooking.id}/attendee-email`, {
        method: "PATCH",
        body: JSON.stringify({ email: editEmail.trim() }),
      });
      currentBooking.attendeeEmail = editEmail.trim();
      toast.success("Invitee email updated", `Email changed to ${editEmail.trim()}`);
      setIsEditEmailOpen(false);
    } catch {
      toast.error("Update Failed", "Could not update invitee email.");
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  // Determine video/meeting location details
  const isVideoLocation =
    currentBooking.location?.type === "ZOOM" ||
    currentBooking.location?.type === "STATIC_VIDEO" ||
    currentBooking.location?.type === "CUSTOM_LINK" ||
    (!currentBooking.location && !currentBooking.attendeePhoneNumber);

  const locationLabel = currentBooking.location
    ? currentBooking.location.type === "ZOOM"
      ? "Zoom Video Meeting"
      : currentBooking.location.type === "IN_PERSON"
      ? "In-Person Meeting"
      : currentBooking.location.type === "HOST_CALLS_ATTENDEE" || currentBooking.location.type === "ATTENDEE_CALLS_HOST"
      ? "Phone Call"
      : currentBooking.location.data?.url
      ? "Web Conference"
      : "Zoom"
    : currentBooking.attendeePhoneNumber
    ? "Phone Call"
    : "Zoom";

  const joinUrl = currentBooking.location?.data?.startUrl
    ? String(currentBooking.location.data.startUrl)
    : currentBooking.location?.data?.joinUrl
    ? String(currentBooking.location.data.joinUrl)
    : currentBooking.location?.data?.url
    ? String(currentBooking.location.data.url)
    : `/public/bookings/${currentBooking.id}`;

  return (
    <>
      {/* Backdrop overlay on mobile screens */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Slide-in Drawer matching Calendly sidebar with smooth animation */}
      <div
        className={`fixed inset-y-0 right-0 z-50 lg:static lg:z-auto transition-[width,opacity] duration-300 ease-in-out shrink-0 ${
          isOpen
            ? "w-full sm:w-[460px] lg:w-[480px] opacity-100 pointer-events-auto"
            : "w-0 opacity-0 pointer-events-none"
        }`}
      >
        <aside
          className={`w-full h-full lg:rounded-2xl border-l lg:border border-neutral-200 bg-white shadow-2xl lg:shadow-xl flex flex-col min-h-screen lg:min-h-[620px] lg:max-h-[calc(100vh-7rem)] lg:sticky lg:top-6 transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
        {/* Drawer Header matching screenshot */}
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-neutral-200 sticky top-0 bg-white z-10 lg:rounded-t-2xl space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-base font-bold tracking-tight text-neutral-900 truncate">
                {currentBooking.eventType.title}
              </h2>
              <p className="text-xs font-medium text-neutral-600">
                {formattedDayAndDate}
              </p>
              <p className="text-xs text-neutral-500">
                {formattedTimeRange} ({currentBooking.host.timezone})
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer shrink-0"
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Action Buttons: Only show Reschedule & Cancel for upcoming meetings */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isUpcoming && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onReschedule(currentBooking)}
                  className="rounded-full border border-neutral-800 text-neutral-800 hover:bg-neutral-50 px-3.5 py-1.5 text-xs font-semibold gap-1.5 shadow-2xs cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Reschedule</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onCancel(currentBooking)}
                  className="rounded-full border border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700 px-3.5 py-1.5 text-xs font-semibold gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Cancel</span>
                </Button>
              </>
            )}

            {isCancelled && (
              <>
                <Badge variant="danger" className="text-xs py-1 px-3">
                  Cancelled
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onReschedule(currentBooking)}
                  className="rounded-full border-neutral-300 text-neutral-800 hover:bg-neutral-50 px-3.5 py-1 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Rebook</span>
                </Button>
                {onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(currentBooking)}
                    className="text-rose-600 hover:bg-rose-50 text-xs px-3 py-1 rounded-full cursor-pointer"
                  >
                    Delete record
                  </Button>
                )}
              </>
            )}

            {isPast && (
              <>
                <Badge variant="secondary" className="text-xs py-1 px-3 bg-neutral-100 text-neutral-700 font-semibold border-neutral-200">
                  Completed
                </Badge>
                <Button asChild variant="outline" size="sm" className="rounded-full border-neutral-300 text-xs font-semibold hover:bg-neutral-50 px-3.5 py-1 gap-1.5 cursor-pointer">
                  <Link href={`/public/${currentBooking.host.username}/${currentBooking.eventType.slug}`} target="_blank">
                    <RefreshCw className="h-3 w-3" />
                    <span>Schedule Follow-up</span>
                  </Link>
                </Button>
                {onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(currentBooking)}
                    className="text-neutral-500 hover:text-rose-600 hover:bg-rose-50 text-xs px-3 py-1 rounded-full cursor-pointer"
                  >
                    Delete record
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Sub-Tabs: Details vs Notes */}
          <div className="flex items-center gap-6 pt-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className="relative pb-2 transition-colors cursor-pointer text-neutral-900"
            >
              <span>Details</span>
              {activeTab === "details" && (
                <div className="absolute bottom-0 inset-x-0 h-[3px] bg-blue-600 rounded-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("notes")}
              className="relative pb-2 transition-colors cursor-pointer text-neutral-600 hover:text-neutral-900"
            >
              <span>Notes</span>
              {activeTab === "notes" && (
                <div className="absolute bottom-0 inset-x-0 h-[3px] bg-blue-600 rounded-full" />
              )}
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === "details" ? (
            <div className="space-y-5">
              {/* 1. Invitees Section matching screenshot */}
              <div className="space-y-3.5 pb-5 border-b border-neutral-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-neutral-900">Invitees</h3>
                </div>

                {/* Invitee Avatar & Name */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center select-none shadow-2xs">
                    {attendeeInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-neutral-900 truncate">
                      {currentBooking.attendeeName}
                    </p>
                  </div>
                </div>

                {/* Contact Rows */}
                <div className="space-y-2 pt-1 text-xs text-neutral-800">
                  {/* Email row with edit icon */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Mail className="h-4 w-4 text-neutral-600 shrink-0" />
                    <span className="truncate font-medium">{currentBooking.attendeeEmail}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditEmail(currentBooking.attendeeEmail);
                        setIsEditEmailOpen(true);
                      }}
                      className="text-neutral-400 hover:text-blue-600 transition-colors p-0.5 cursor-pointer ml-1"
                      title="Edit invitee email"
                    >
                      <Pencil className="h-3.5 w-3.5 text-blue-600 hover:text-blue-700" />
                    </button>
                  </div>

                  {/* Phone row */}
                  {currentBooking.attendeePhoneNumber && (
                    <button
                      type="button"
                      onClick={handleCopyPhone}
                      className="flex items-center gap-2.5 min-w-0 text-left hover:text-blue-600 transition-colors cursor-pointer"
                      title="Click to copy phone number"
                    >
                      <Smartphone className="h-4 w-4 text-neutral-600 shrink-0" />
                      <span className="font-medium">{currentBooking.attendeePhoneNumber}</span>
                    </button>
                  )}

                  {/* Timezone row */}
                  <div className="flex items-center gap-2.5">
                    <Globe className="h-4 w-4 text-neutral-600 shrink-0" />
                    <span className="font-medium">{currentBooking.attendeeTimeZone}</span>
                  </div>
                </div>

                {/* Invitee Footer Actions: Email, View Profile */}
                <div className="flex items-center gap-4 pt-2 text-xs font-semibold">
                  <a
                    href={`mailto:${currentBooking.attendeeEmail}`}
                    className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Email</span>
                  </a>

                  <Link
                    href={`/public/${currentBooking.attendeeName.toLowerCase().replace(/[^a-z0-9]+/g, "") || currentBooking.host.username}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>View full profile</span>
                  </Link>
                </div>
              </div>

              {/* 2. Location Section */}
              <div className="space-y-3 pb-5 border-b border-neutral-200">
                <h3 className="text-sm font-bold text-neutral-900">Location</h3>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Icon + Label */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isVideoLocation ? (
                      <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Video className="h-3.5 w-3.5 fill-current" />
                      </div>
                    ) : currentBooking.location?.type === "IN_PERSON" ? (
                      <div className="h-7 w-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <MapPin className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-neutral-800 text-white flex items-center justify-center shrink-0">
                        <PhoneCall className="h-3.5 w-3.5" />
                      </div>
                    )}

                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-neutral-900 truncate">
                        {locationLabel}
                      </span>
                      {currentBooking.location?.type === "ZOOM" && (
                        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                          {Boolean(currentBooking.location.data?.meetingId) && (
                            <span>ID: {String(currentBooking.location.data.meetingId)}</span>
                          )}
                          {Boolean(currentBooking.location.data?.password) && (
                            <span>Passcode: {String(currentBooking.location.data.password)}</span>
                          )}
                        </div>
                      )}
                      {currentBooking.location?.type === "IN_PERSON" && Boolean(currentBooking.location.data?.address) && (
                        <span className="text-[11px] text-neutral-500 truncate">
                          {String(currentBooking.location.data.address)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Actions: Join meeting for Video, Copy / Directions for In-Person, Call for Phone */}
                  {isVideoLocation && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-full border border-neutral-800 text-neutral-900 hover:bg-neutral-50 px-4 py-1.5 text-xs font-semibold shadow-2xs shrink-0"
                    >
                      <a href={joinUrl} target="_blank" rel="noopener noreferrer">
                        Join meeting
                      </a>
                    </Button>
                  )}

                  {currentBooking.location?.type === "IN_PERSON" && Boolean(currentBooking.location.data?.address) && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(String(currentBooking.location?.data?.address));
                          toast.success("Address copied to clipboard", String(currentBooking.location?.data?.address));
                        }}
                        className="rounded-full border border-neutral-300 text-neutral-800 hover:bg-neutral-50 px-3.5 py-1.5 text-xs font-semibold shadow-2xs cursor-pointer gap-1.5"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Copy address</span>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
                      >
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(String(currentBooking.location.data.address))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  )}

                  {(currentBooking.location?.type === "HOST_CALLS_ATTENDEE" || currentBooking.location?.type === "ATTENDEE_CALLS_HOST" || (!currentBooking.location && currentBooking.attendeePhoneNumber)) && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-full border border-neutral-300 text-neutral-800 hover:bg-neutral-50 px-3.5 py-1.5 text-xs font-semibold shadow-2xs shrink-0 gap-1.5"
                    >
                      <a href={`tel:${currentBooking.attendeePhoneNumber || currentBooking.location?.data?.hostPhoneNumber}`}>
                        <PhoneCall className="h-3 w-3" />
                        <span>Call</span>
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              {/* 3. Hosts Section matching screenshot */}
              <div className="space-y-2.5 pb-5 border-b border-neutral-200">
                <h3 className="text-sm font-bold text-neutral-900">Hosts</h3>
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center select-none">
                    {hostInitial}
                  </div>
                  <p className="text-xs font-semibold text-neutral-900">
                    <span className="text-blue-600 font-bold">{currentBooking.host.name}</span>{" "}
                    <span className="text-neutral-500 font-normal">(you)</span>
                  </p>
                </div>
              </div>

              {/* 4. Timeline Section matching screenshot */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-neutral-900">Timeline</h3>
                <div className="space-y-0 text-xs">
                  {/* Step 1: Event booked by */}
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex flex-col items-center">
                      <Calendar className="h-4 w-4 text-neutral-600 shrink-0" />
                      <div className="w-[1.5px] bg-neutral-200 h-6 my-1" />
                    </div>
                    <div>
                      <p className="font-bold text-neutral-900">
                        Event booked by {currentBooking.attendeeName.split(" ")[0]}
                      </p>
                      <p className="text-neutral-500 text-[11px]">
                        {bookedDateFormatted} at {bookedTimeFormatted} ({tzShort})
                      </p>
                    </div>
                  </div>

                  {/* Step 2: Event starts */}
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <Clock className="h-4 w-4 text-neutral-600 shrink-0" />
                    </div>
                    <div>
                      <p className="font-bold text-neutral-900">Event starts</p>
                      <p className="text-neutral-500 text-[11px]">
                        {startsDateFormatted} at {startsTimeFormatted} ({tzShort})
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer link note matching screenshot */}
                <p className="pt-3 text-xs text-neutral-600 font-normal">
                  Based on the{" "}
                  <Link
                    href={`/public/${currentBooking.host.username}/${currentBooking.eventType.slug}`}
                    target="_blank"
                    className="text-blue-600 font-bold hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>{currentBooking.eventType.title}</span>
                    <ExternalLink className="h-3 w-3 inline ml-0.5" />
                  </Link>{" "}
                  event type.
                </p>
              </div>
            </div>
          ) : (
            /* Notes Tab Content */
            <div className="space-y-5 text-xs">
              {/* Attendee Notes / Agenda */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-neutral-900">Meeting Notes / Agenda</h3>
                {currentBooking.attendeeNotes ? (
                  <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 text-neutral-800 whitespace-pre-wrap leading-relaxed font-normal">
                    {currentBooking.attendeeNotes}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 italic">No notes provided by attendee.</p>
                )}
              </div>

              {/* Custom Form Answers */}
              {currentBooking.customResponses && currentBooking.customResponses.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-neutral-200">
                  <h3 className="text-sm font-bold text-neutral-900">Custom Form Answers</h3>
                  <div className="space-y-2">
                    {currentBooking.customResponses.map((r) => (
                      <div
                        key={r.questionId}
                        className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-1"
                      >
                        <p className="font-medium text-neutral-500">{r.label}</p>
                        <p className="font-semibold text-neutral-900 text-xs">
                          {r.type === "CHECKBOX"
                            ? r.value
                              ? "✓ Yes"
                              : "No"
                            : r.type === "SELECT"
                            ? r.selectedOptionLabel || String(r.value)
                            : String(r.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>

      {/* Edit Invitee Email Modal matching user screenshot */}
      {isEditEmailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl border border-neutral-200 space-y-5 animate-in zoom-in-95 duration-150">
            <h3 className="text-xl font-bold tracking-tight text-neutral-900">
              Edit invitee email
            </h3>

            <div className="space-y-3 text-xs text-neutral-600 leading-relaxed">
              <p className="font-semibold text-neutral-800">
                A notification will be sent to the updated email address.
              </p>
              <p className="text-neutral-500">
                Note: If you are using calendar invitation notifications, this update will override any changes you&apos;ve made to the calendar event.
              </p>
            </div>

            <form onSubmit={handleUpdateAttendeeEmail} className="space-y-6 pt-1">
              <div className="space-y-1.5">
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  placeholder="name@example.com"
                  className="w-full h-11 px-3.5 rounded-lg border-2 border-blue-600 focus:outline-none text-xs font-medium text-neutral-900 shadow-2xs"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditEmailOpen(false)}
                  className="rounded-full border border-neutral-900 text-neutral-900 hover:bg-neutral-50 px-8 py-2 text-xs font-semibold shadow-2xs h-10 cursor-pointer"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={isUpdatingEmail}
                  className="rounded-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 text-xs font-semibold shadow-2xs h-10 cursor-pointer flex items-center gap-2"
                >
                  {isUpdatingEmail ? "Updating..." : "Update"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

