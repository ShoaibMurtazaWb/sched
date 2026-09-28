"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  MapPin,
  PhoneCall,
  Link2,
  ChevronDown,
  ExternalLink,
  Plus,
  Trash2,
  AlertCircle,
  Mail,
  Calendar,
  Clock,
} from "lucide-react";
import { ZoomLogo } from "@/components/zoom-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { SidePanel } from "@/components/ui/side-panel";
import { api, apiUrl, type CurrentUser, type EventType } from "@/lib/api";
import { fieldErrors, formatApiError } from "@/lib/api-error";
import type { LocationType, CustomQuestion, ScheduleResponse, ZoomIntegrationResponse } from "@sched/api-contract";

const DURATION_PRESETS = [15, 30, 45, 60];

function validateCustomUrl(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return "Meeting URL is required";
  }
  let testUrl = trimmed;
  if (!/^https?:\/\//i.test(testUrl)) {
    testUrl = `https://${testUrl}`;
  }
  try {
    const parsed = new URL(testUrl);
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      return "Please enter a valid URL";
    }
  } catch {
    return "Please enter a valid URL";
  }
  return null;
}

function validateInPersonAddress(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) {
    return "Meeting address is required";
  }
  if (trimmed.length < 3) {
    return "Meeting address must be at least 3 characters";
  }
  if (trimmed.length > 300) {
    return "Meeting address cannot exceed 300 characters";
  }
  return null;
}

const WEEK_DAYS = [
  { day: 0, name: "Sunday", short: "S" },
  { day: 1, name: "Monday", short: "M" },
  { day: 2, name: "Tuesday", short: "T" },
  { day: 3, name: "Wednesday", short: "W" },
  { day: 4, name: "Thursday", short: "T" },
  { day: 5, name: "Friday", short: "F" },
  { day: 6, name: "Saturday", short: "S" },
];

function formatTime12(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  const h = parseInt(parts[0] || "0", 10);
  const m = parts[1] || "00";
  const period = h >= 12 ? "pm" : "am";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m}${period}`;
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface EventTypeDrawerProps {
  isOpen: boolean;
  eventTypeId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EventTypeDrawer({
  isOpen,
  eventTypeId,
  onClose,
  onSaved,
}: EventTypeDrawerProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Accordion Section States - questions expanded by default so section is clearly visible
  const [openSections, setOpenSections] = useState({
    duration: true,
    location: true,
    description: true,
    availability: true,
    host: true,
    questions: true,
  });

  // Form Fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [duration, setDuration] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState<string>("");
  const [description, setDescription] = useState("");

  // Location Fields
  const [locationType, setLocationType] = useState<LocationType | null>(null);
  const [inPersonAddress, setInPersonAddress] = useState("");
  const [inPersonNotes, setInPersonNotes] = useState("");
  const [videoNotes, setVideoNotes] = useState("");
  const [customLinkUrl, setCustomLinkUrl] = useState("");
  const [customLinkNotes, setCustomLinkNotes] = useState("");
  const [hostCallsAttendeeNotes, setHostCallsAttendeeNotes] = useState("");
  const [attendeeCallsHostPhone, setAttendeeCallsHostPhone] = useState("");
  const [attendeeCallsHostNotes, setAttendeeCallsHostNotes] = useState("");

  // Custom Questions
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Zoom Integration Status
  const [isZoomConnected, setIsZoomConnected] = useState<boolean | null>(null);

  // Load user and schedule
  useEffect(() => {
    api<CurrentUser>("/auth/me").then(setUser).catch(() => {});
    api<ScheduleResponse>("/schedules/default").then(setSchedule).catch(() => {});
  }, []);

  // Check Zoom connection status when drawer is open, and refresh on window focus
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    function checkZoom() {
      api<ZoomIntegrationResponse | null>("/integrations/zoom")
        .then((res) => {
          if (isMounted) {
            setIsZoomConnected(res?.status === "CONNECTED");
          }
        })
        .catch(() => {
          if (isMounted) {
            setIsZoomConnected(false);
          }
        });
    }

    checkZoom();
    window.addEventListener("focus", checkZoom);
    return () => {
      isMounted = false;
      window.removeEventListener("focus", checkZoom);
    };
  }, [isOpen]);

  // Reset or load event data when drawer opens or eventTypeId changes
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setErrors({});

    if (!eventTypeId) {
      // New Event Type Defaults
      setTitle("New Meeting");
      setSlug("new-meeting");
      setDuration(30);
      setCustomDuration("");
      setDescription("");
      setLocationType(null);
      setInPersonAddress("");
      setInPersonNotes("");
      setVideoNotes("");
      setCustomLinkUrl("");
      setCustomLinkNotes("");
      setHostCallsAttendeeNotes("");
      setAttendeeCallsHostPhone("");
      setAttendeeCallsHostNotes("");
      setCustomQuestions([]);
      setIsLoading(false);
      return;
    }

    // Load Existing Event Type
    setIsLoading(true);
    api<EventType>(`/event-types/${eventTypeId}`)
      .then((data) => {
        setTitle(data.title);
        setSlug(data.slug);
        setDuration(data.durationMinutes);
        if (!DURATION_PRESETS.includes(data.durationMinutes)) {
          setCustomDuration(String(data.durationMinutes));
        } else {
          setCustomDuration("");
        }
        setDescription(data.description || "");

        if (data.customQuestions && Array.isArray(data.customQuestions)) {
          setCustomQuestions(data.customQuestions);
        } else {
          setCustomQuestions([]);
        }

        if (data.location) {
          setLocationType(data.location.type as LocationType);
          const locData = (data.location.data || {}) as Record<string, unknown>;
          if (data.location.type === "IN_PERSON") {
            setInPersonAddress(String(locData.address || ""));
            setInPersonNotes(String(locData.extraNotes || ""));
          } else if (data.location.type === "ZOOM") {
            setVideoNotes(String(locData.extraNotes || ""));
          } else if (data.location.type === "STATIC_VIDEO") {
            setLocationType("CUSTOM_LINK");
            setCustomLinkUrl(String(locData.url || ""));
            setCustomLinkNotes(String(locData.extraNotes || ""));
          } else if (data.location.type === "CUSTOM_LINK") {
            setCustomLinkUrl(String(locData.url || ""));
            setCustomLinkNotes(String(locData.extraNotes || ""));
          } else if (data.location.type === "HOST_CALLS_ATTENDEE") {
            setHostCallsAttendeeNotes(String(locData.extraNotes || ""));
          } else if (data.location.type === "ATTENDEE_CALLS_HOST") {
            setAttendeeCallsHostPhone(String(locData.hostPhoneNumber || ""));
            setAttendeeCallsHostNotes(String(locData.extraNotes || ""));
          }
        } else {
          setLocationType(null);
        }
      })
      .catch(() => {
        setError("Could not load event type details.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, eventTypeId]);

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!eventTypeId) {
      setSlug(generateSlug(val) || "meeting");
    }
  }

  function handleAddQuestion(type: "TEXT" | "TEXTAREA" | "SELECT") {
    const id = crypto.randomUUID();
    if (type === "SELECT") {
      setCustomQuestions((prev) => [
        ...prev,
        {
          id,
          type: "SELECT",
          label: "",
          required: false,
          allowMultiple: false,
          options: [
            { id: crypto.randomUUID(), label: "Option 1" },
            { id: crypto.randomUUID(), label: "Option 2" },
          ],
        },
      ]);
    } else {
      setCustomQuestions((prev) => [
        ...prev,
        {
          id,
          type,
          label: "",
          required: false,
        },
      ]);
    }
  }

  function handleRemoveQuestion(index: number) {
    setCustomQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateQuestion(index: number, updates: Partial<CustomQuestion>) {
    setCustomQuestions((prev) =>
      prev.map((q, i) => (i === index ? ({ ...q, ...updates } as CustomQuestion) : q))
    );
  }

  function handleAddOption(questionIndex: number) {
    setCustomQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== questionIndex || q.type !== "SELECT") return q;
        const currentOptions = q.options || [];
        return {
          ...q,
          options: [
            ...currentOptions,
            { id: crypto.randomUUID(), label: `Option ${currentOptions.length + 1}` },
          ],
        };
      })
    );
  }

  function handleUpdateOption(questionIndex: number, optionIndex: number, label: string) {
    setCustomQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== questionIndex || q.type !== "SELECT") return q;
        const target = q.options[optionIndex];
        if (!target) return q;
        const newOptions = [...q.options];
        newOptions[optionIndex] = { id: target.id || crypto.randomUUID(), label };
        return { ...q, options: newOptions };
      })
    );
  }

  function handleRemoveOption(questionIndex: number, optionIndex: number) {
    setCustomQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== questionIndex || q.type !== "SELECT") return q;
        if (q.options.length <= 2) return q;
        return {
          ...q,
          options: q.options.filter((_, optIdx) => optIdx !== optionIndex),
        };
      })
    );
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setErrors({});

    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = "Event title is required";
    }

    if (!locationType) {
      newErrors.location = "Please select a location for this event type.";
    } else if (locationType === "IN_PERSON") {
      const addrErr = validateInPersonAddress(inPersonAddress);
      if (addrErr) newErrors.inPersonAddress = addrErr;
    } else if (locationType === "CUSTOM_LINK") {
      const urlErr = validateCustomUrl(customLinkUrl);
      if (urlErr) newErrors.customLinkUrl = urlErr;
    } else if (locationType === "ATTENDEE_CALLS_HOST") {
      if (!attendeeCallsHostPhone.trim()) {
        newErrors.attendeeCallsHostPhone = "Phone number is required";
      } else if (attendeeCallsHostPhone.trim().length < 7) {
        newErrors.attendeeCallsHostPhone = "Please enter a valid phone number";
      }
    } else if (locationType === "ZOOM" && isZoomConnected === false) {
      newErrors.location = "Please connect your Zoom account first or choose another location.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (
        newErrors.location ||
        newErrors.inPersonAddress ||
        newErrors.customLinkUrl ||
        newErrors.attendeeCallsHostPhone
      ) {
        setOpenSections((prev) => ({ ...prev, location: true }));
      }
      toast.error("Please complete required fields", "Check the highlighted fields to continue.");
      setIsSaving(false);
      return;
    }

    // Construct Location Payload
    let locationData: Record<string, unknown> = {};
    if (locationType === "ZOOM") {
      locationData = {
        extraNotes: videoNotes || undefined,
      };
    } else if (locationType === "IN_PERSON") {
      locationData = {
        address: inPersonAddress.trim(),
        displayPublicAddress: true,
        extraNotes: inPersonNotes || undefined,
      };
    } else if (locationType === "CUSTOM_LINK" || (locationType as string) === "STATIC_VIDEO") {
      const formattedUrl = /^https?:\/\//i.test(customLinkUrl.trim())
        ? customLinkUrl.trim()
        : `https://${customLinkUrl.trim()}`;
      locationData = {
        url: formattedUrl,
        extraNotes: customLinkNotes || undefined,
      };
    } else if (locationType === "HOST_CALLS_ATTENDEE") {
      locationData = {
        extraNotes: hostCallsAttendeeNotes || undefined,
      };
    } else if (locationType === "ATTENDEE_CALLS_HOST") {
      locationData = {
        hostPhoneNumber: attendeeCallsHostPhone.trim(),
        extraNotes: attendeeCallsHostNotes || undefined,
      };
    }

    const effectiveSlug = (slug || generateSlug(title)).trim() || "meeting";

    const payload = {
      title: title.trim(),
      slug: effectiveSlug,
      durationMinutes: Number(duration),
      description: description.trim(),
      location: {
        type: locationType,
        data: locationData,
      },
      customQuestions,
    };

    try {
      if (eventTypeId) {
        await api(`/event-types/${eventTypeId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Event type updated", "Changes saved successfully.");
      } else {
        await api("/event-types", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Event type created", "Your new booking link is live.");
      }
      onSaved();
      onClose();
    } catch (caught: unknown) {
      const userMessage = formatApiError(
        caught,
        eventTypeId
          ? "Unable to update event. Please try again."
          : "Unable to create event. Please try again."
      );
      setError(userMessage);
      const serverFields = fieldErrors(caught);
      if (Object.keys(serverFields).length > 0) {
        setErrors((prev) => ({ ...prev, ...serverFields }));
        toast.error("Please complete required fields", userMessage);
      } else {
        toast.error(
          eventTypeId ? "Unable to update event" : "Unable to create event",
          userMessage
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  const footerContent = (
    <div className="w-full flex items-center justify-between gap-3">
      {locationType === "ZOOM" && isZoomConnected === false ? (
        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium truncate">
          Connect Zoom to continue
        </span>
      ) : (
        <div />
      )}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          className="rounded-full border-border-subtle text-text-main hover:bg-surface-subtle text-xs font-semibold px-4 h-9 cursor-pointer"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isSaving || (locationType === "ZOOM" && isZoomConnected === false)}
          onClick={handleSave}
          className="rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold px-5 shadow-xs gap-1.5 cursor-pointer disabled:opacity-50 h-9"
        >
          {isSaving ? (
            <>
              <Spinner size="sm" />
              <span>Saving…</span>
            </>
          ) : (
            <span>{eventTypeId ? "Save changes" : "Create"}</span>
          )}
        </Button>
      </div>
    </div>
  );

  const locationSummary =
    !locationType
      ? "No location set"
      : locationType === "ZOOM"
      ? "Zoom"
      : locationType === "STATIC_VIDEO"
      ? "Video link"
      : locationType === "HOST_CALLS_ATTENDEE" || locationType === "ATTENDEE_CALLS_HOST"
      ? "Phone call"
      : locationType === "IN_PERSON"
      ? "In-person"
      : "Custom link";

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={eventTypeId ? "Edit Event Type" : "New Event Type"}
      footer={footerContent}
    >
      {/* Title Identity Header matching Reference Screenshot */}
      <div className="space-y-2 pb-4 border-b border-border-subtle">
        <label
          htmlFor="event-type-title"
          className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block"
        >
          Event type
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-3.5 flex items-center justify-center pointer-events-none">
            <span className="h-3 w-3 rounded-full bg-brand ring-4 ring-brand/15 shrink-0" />
          </div>
          <input
            id="event-type-title"
            type="text"
            value={title}
            onChange={(e) => {
              handleTitleChange(e.target.value);
              if (errors.title) {
                setErrors((prev) => {
                  const copy = { ...prev };
                  delete copy.title;
                  return copy;
                });
              }
            }}
            placeholder="e.g. 30 Minute Meeting"
            className={`w-full text-base font-bold text-text-main bg-surface-subtle/50 hover:bg-surface-subtle focus:bg-surface border focus:ring-2 focus:outline-none transition-all pl-9 pr-3.5 py-2 rounded-xl ${
              errors.title
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-border-subtle focus:border-brand focus:ring-brand/20"
            }`}
          />
        </div>
        <p className="text-xs text-text-muted font-medium pl-1">One-on-One</p>
        {errors.title && (
          <p className="text-xs text-rose-500 font-medium pl-1 animate-in fade-in-50">{errors.title}</p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 dark:text-rose-400 font-medium">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4 py-8 text-center text-xs text-text-muted">
          <Spinner size="default" />
          <p>Loading event details…</p>
        </div>
      ) : (
        <div className="space-y-2 py-1">
          {/* 1. Duration Section */}
          <div
            className={`rounded-2xl transition-all duration-200 ${
              openSections.duration
                ? "bg-blue-50/50 dark:bg-blue-950/25 overflow-hidden"
                : "rounded-xl overflow-hidden"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection("duration")}
              className={`flex w-full items-center justify-between px-3.5 text-sm font-semibold transition-all cursor-pointer group ${
                openSections.duration
                  ? "pt-3 pb-2 text-brand"
                  : "py-2.5 rounded-xl text-text-main hover:bg-blue-50/70 hover:text-brand dark:hover:bg-blue-950/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold group-hover:text-brand transition-colors">Duration</span>
                <span className="text-xs font-normal text-text-muted group-hover:text-brand/80 transition-colors">
                  ({duration} min)
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-text-muted group-hover:text-brand transition-transform duration-200 ${
                  openSections.duration ? "rotate-180 text-brand" : ""
                }`}
              />
            </button>

            {openSections.duration && (
              <div className="px-3.5 pt-1 pb-3.5 space-y-3 animate-in fade-in-50 duration-150">
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        setDuration(mins);
                        setCustomDuration("");
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        duration === mins && !customDuration
                          ? "bg-brand text-white shadow-2xs font-bold"
                          : "border border-border-subtle bg-surface text-text-sub hover:bg-surface-subtle"
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-text-sub">Custom:</span>
                  <Input
                    type="number"
                    min={5}
                    max={480}
                    value={customDuration}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomDuration(val);
                      if (val && !isNaN(Number(val))) {
                        setDuration(Number(val));
                      }
                    }}
                    placeholder="e.g. 90"
                    className="h-8 w-24 text-xs rounded-lg border-border-subtle bg-surface text-text-main"
                  />
                  <span className="text-xs text-text-muted">minutes</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Location Section */}
          <div
            className={`rounded-2xl transition-all duration-200 ${
              openSections.location
                ? "bg-blue-50/50 dark:bg-blue-950/25 overflow-hidden"
                : "rounded-xl overflow-hidden"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection("location")}
              className={`flex w-full ${!locationType ? "items-start" : "items-center"} justify-between px-3.5 text-sm font-semibold transition-all cursor-pointer group ${
                openSections.location
                  ? "pt-3 pb-2 text-brand"
                  : "py-2.5 rounded-xl text-text-main hover:bg-blue-50/70 hover:text-brand dark:hover:bg-blue-950/30"
              }`}
            >
              {!locationType ? (
                <div className="flex flex-col items-start gap-1 text-left">
                  <span className="font-semibold text-text-main group-hover:text-brand transition-colors">
                    Location
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-text-sub font-normal">
                    <svg
                      className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 shrink-0"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm0-9.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 5.5zm0 6a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-text-sub group-hover:text-brand/80 transition-colors">
                      No location set
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-main group-hover:text-brand transition-colors">Location</span>
                  <span className="text-xs font-normal text-text-muted group-hover:text-brand/80 transition-colors">
                    ({locationSummary})
                  </span>
                </div>
              )}
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-text-muted group-hover:text-brand transition-transform duration-200 ${
                  !locationType ? "mt-1" : ""
                } ${openSections.location ? "rotate-180 text-brand" : ""}`}
              />
            </button>

            {openSections.location && (
              <div className="px-3.5 pt-1 pb-3.5 space-y-3 animate-in fade-in-50 duration-150">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLocationType(locationType === "ZOOM" ? null : "ZOOM");
                      if (errors.location) {
                        setErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.location;
                          return copy;
                        });
                      }
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                      locationType === "ZOOM"
                        ? isZoomConnected === false
                          ? "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 shadow-2xs"
                          : "border-brand bg-brand/10 text-brand shadow-2xs ring-1 ring-brand/30"
                        : "border-border-subtle bg-surface text-text-main hover:bg-surface-subtle"
                    }`}
                  >
                    <ZoomLogo className="h-4 w-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">Zoom</span>
                        {isZoomConnected === false && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                            Connect
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted font-normal truncate">
                        Dynamic meeting room
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLocationType(locationType === "IN_PERSON" ? null : "IN_PERSON");
                      if (errors.location) {
                        setErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.location;
                          return copy;
                        });
                      }
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                      locationType === "IN_PERSON"
                        ? "border-brand bg-brand/10 text-brand shadow-2xs ring-1 ring-brand/30"
                        : "border-border-subtle bg-surface text-text-main hover:bg-surface-subtle"
                    }`}
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-rose-500" />
                    <div>
                      <div className="font-bold">In-person</div>
                      <div className="text-[10px] text-text-muted font-normal">Physical address</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLocationType(
                        locationType === "HOST_CALLS_ATTENDEE" || locationType === "ATTENDEE_CALLS_HOST"
                          ? null
                          : "HOST_CALLS_ATTENDEE"
                      );
                      if (errors.location) {
                        setErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.location;
                          return copy;
                        });
                      }
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                      locationType === "HOST_CALLS_ATTENDEE" || locationType === "ATTENDEE_CALLS_HOST"
                        ? "border-brand bg-brand/10 text-brand shadow-2xs ring-1 ring-brand/30"
                        : "border-border-subtle bg-surface text-text-main hover:bg-surface-subtle"
                    }`}
                  >
                    <PhoneCall className="h-4 w-4 shrink-0 text-emerald-500" />
                    <div>
                      <div className="font-bold">Phone call</div>
                      <div className="text-[10px] text-text-muted font-normal">Inbound / Outbound</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLocationType(locationType === "CUSTOM_LINK" ? null : "CUSTOM_LINK");
                      if (errors.location) {
                        setErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.location;
                          return copy;
                        });
                      }
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                      locationType === "CUSTOM_LINK"
                        ? "border-brand bg-brand/10 text-brand shadow-2xs ring-1 ring-brand/30"
                        : "border-border-subtle bg-surface text-text-main hover:bg-surface-subtle"
                    }`}
                  >
                    <Link2 className="h-4 w-4 shrink-0 text-purple-500" />
                    <div>
                      <div className="font-bold">Custom link</div>
                      <div className="text-[10px] text-text-muted font-normal">Custom meeting room</div>
                    </div>
                  </button>
                </div>

                {errors.location && (
                  <p className="text-xs text-rose-500 font-medium pl-1 animate-in fade-in-50">
                    {errors.location}
                  </p>
                )}

                {/* Contextual Location Inputs */}
                {locationType === "ZOOM" && (
                  isZoomConnected === false ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <p className="font-bold">Zoom Account Not Connected</p>
                          <p className="text-[11px] text-text-sub leading-relaxed font-normal">
                            Connect your Zoom account to Sched to generate dynamic meetings, or select another location option above.
                          </p>
                        </div>
                      </div>

                      <div className="pt-0.5">
                        <a
                          href={apiUrl("/integrations/zoom/connect")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
                        >
                          <ZoomLogo className="h-3.5 w-3.5" />
                          <span>Connect Zoom</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-brand/10 border border-brand/20 text-xs text-text-main space-y-1">
                      <div className="flex items-center gap-2 font-semibold text-brand">
                        <ZoomLogo className="h-4 w-4 shrink-0" />
                        <span>Zoom Video Integration Connected</span>
                      </div>
                      <p className="text-[11px] text-text-sub leading-relaxed font-normal">
                        Sched will automatically create a unique Zoom meeting for each booking and deliver join links in the calendar invites.
                      </p>
                    </div>
                  )
                )}

                {locationType === "IN_PERSON" && (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="drawer-address" className="text-xs font-semibold text-text-main">
                      Physical address / Location details <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="drawer-address"
                      type="text"
                      value={inPersonAddress}
                      onChange={(e) => {
                        setInPersonAddress(e.target.value);
                        if (errors.inPersonAddress) {
                          setErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.inPersonAddress;
                            return copy;
                          });
                        }
                      }}
                      placeholder="e.g. 123 Main St, Suite 400"
                      className={`h-9 text-xs rounded-xl border bg-surface text-text-main transition-colors ${
                        errors.inPersonAddress
                          ? "border-rose-400 focus:border-rose-500 ring-1 ring-rose-500/20"
                          : "border-border-subtle focus:border-brand"
                      }`}
                    />
                    {errors.inPersonAddress && (
                      <p className="text-xs text-rose-500 font-medium pl-0.5 animate-in fade-in-50">
                        {errors.inPersonAddress}
                      </p>
                    )}
                  </div>
                )}

                {(locationType === "HOST_CALLS_ATTENDEE" || locationType === "ATTENDEE_CALLS_HOST") && (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setLocationType("HOST_CALLS_ATTENDEE")}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          locationType === "HOST_CALLS_ATTENDEE"
                            ? "bg-brand text-white border-brand font-bold"
                            : "bg-surface-subtle text-text-sub border-border-subtle hover:bg-surface-muted"
                        }`}
                      >
                        I will call attendee
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationType("ATTENDEE_CALLS_HOST")}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          locationType === "ATTENDEE_CALLS_HOST"
                            ? "bg-brand text-white border-brand font-bold"
                            : "bg-surface-subtle text-text-sub border-border-subtle hover:bg-surface-muted"
                        }`}
                      >
                        Attendee calls me
                      </button>
                    </div>
                    {locationType === "ATTENDEE_CALLS_HOST" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="drawer-phone" className="text-xs font-semibold text-text-main">
                          Your phone number <span className="text-rose-500">*</span>
                        </Label>
                        <Input
                          id="drawer-phone"
                          type="tel"
                          value={attendeeCallsHostPhone}
                          onChange={(e) => {
                            setAttendeeCallsHostPhone(e.target.value);
                            if (errors.attendeeCallsHostPhone) {
                              setErrors((prev) => {
                                const copy = { ...prev };
                                delete copy.attendeeCallsHostPhone;
                                return copy;
                              });
                            }
                          }}
                          placeholder="+1 (555) 000-0000"
                          className={`h-9 text-xs rounded-xl border bg-surface text-text-main transition-colors ${
                            errors.attendeeCallsHostPhone
                              ? "border-rose-400 focus:border-rose-500 ring-1 ring-rose-500/20"
                              : "border-border-subtle focus:border-brand"
                          }`}
                        />
                        {errors.attendeeCallsHostPhone && (
                          <p className="text-xs text-rose-500 font-medium pl-0.5 animate-in fade-in-50">
                            {errors.attendeeCallsHostPhone}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {locationType === "CUSTOM_LINK" && (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="drawer-custom-url" className="text-xs font-semibold text-text-main">
                      Custom meeting URL <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="drawer-custom-url"
                      type="url"
                      value={customLinkUrl}
                      onChange={(e) => {
                        setCustomLinkUrl(e.target.value);
                        if (errors.customLinkUrl) {
                          setErrors((prev) => {
                            const copy = { ...prev };
                            delete copy.customLinkUrl;
                            return copy;
                          });
                        }
                      }}
                      placeholder="https://custom-room.example.com/meet"
                      className={`h-9 text-xs rounded-xl border bg-surface text-text-main transition-colors ${
                        errors.customLinkUrl
                          ? "border-rose-400 focus:border-rose-500 ring-1 ring-rose-500/20"
                          : "border-border-subtle focus:border-brand"
                      }`}
                    />
                    {errors.customLinkUrl && (
                      <p className="text-xs text-rose-500 font-medium pl-0.5 animate-in fade-in-50">
                        {errors.customLinkUrl}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Description Section */}
          <div
            className={`rounded-2xl transition-all duration-200 ${
              openSections.description
                ? "bg-blue-50/50 dark:bg-blue-950/25 overflow-hidden"
                : "rounded-xl overflow-hidden"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection("description")}
              className={`flex w-full items-center justify-between px-3.5 text-sm font-semibold transition-all cursor-pointer group ${
                openSections.description
                  ? "pt-3 pb-2 text-brand"
                  : "py-2.5 rounded-xl text-text-main hover:bg-blue-50/70 hover:text-brand dark:hover:bg-blue-950/30"
              }`}
            >
              <span className="font-semibold group-hover:text-brand transition-colors">Description</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-text-muted group-hover:text-brand transition-transform duration-200 ${
                  openSections.description ? "rotate-180 text-brand" : ""
                }`}
              />
            </button>

            {openSections.description && (
              <div className="px-3.5 pt-1 pb-3.5 space-y-3 animate-in fade-in-50 duration-150">
                <div className="space-y-1.5">
                  <Label htmlFor="drawer-desc" className="text-xs font-semibold text-text-main">
                    Description / Instructions
                  </Label>
                  <Textarea
                    id="drawer-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Write a summary and details for invitees…"
                    rows={3}
                    className="text-xs rounded-xl border-border-subtle bg-surface text-text-main focus:border-brand resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4. Availability Section */}
          <div
            className={`rounded-2xl transition-all duration-200 ${
              openSections.availability
                ? "bg-blue-50/50 dark:bg-blue-950/25 overflow-hidden"
                : "rounded-xl overflow-hidden"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection("availability")}
              className={`flex w-full items-center justify-between px-3.5 text-sm font-semibold transition-all cursor-pointer group ${
                openSections.availability
                  ? "pt-3 pb-2 text-brand"
                  : "py-2.5 rounded-xl text-text-main hover:bg-blue-50/70 hover:text-brand dark:hover:bg-blue-950/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold group-hover:text-brand transition-colors">Availability</span>
                <span className="text-xs font-normal text-text-muted group-hover:text-brand/80 transition-colors">
                  ({schedule?.name || "Weekdays, hours vary"})
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-text-muted group-hover:text-brand transition-transform duration-200 ${
                  openSections.availability ? "rotate-180 text-brand" : ""
                }`}
              />
            </button>

            {openSections.availability && (
              <div className="px-3.5 pt-1 pb-3.5 space-y-3 text-xs animate-in fade-in-50 duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-text-main font-semibold">
                    <Calendar className="h-3.5 w-3.5 text-text-muted" />
                    <span>{schedule?.name || "Working hours (Default)"}</span>
                  </div>
                  <Link
                    href="/dashboard/availability"
                    className="text-[11px] font-semibold text-brand hover:underline inline-flex items-center gap-1"
                  >
                    <span>Edit schedule</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                {/* Timetable Display matching screenshot */}
                <div className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3.5">
                  <div className="space-y-3">
                    {WEEK_DAYS.map((dayItem) => {
                      const intervals =
                        schedule?.days?.filter((d) => d.dayOfWeek === dayItem.day) || [];
                      const isAvailable = intervals.length > 0;

                      return (
                        <div key={dayItem.day} className="flex items-start gap-3.5 py-0.5">
                          {/* Day Circle Icon Badge */}
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white font-bold text-xs shrink-0 select-none shadow-2xs">
                            {dayItem.short}
                          </div>

                          {/* Time Intervals List */}
                          <div className="min-w-0 flex-1">
                            {isAvailable ? (
                              <div className="space-y-1 pt-0.5">
                                {intervals.map((iv, idx) => (
                                 <div
                                    key={idx}
                                    className="text-xs sm:text-sm font-medium text-text-main tracking-tight font-sans"
                                  >
                                    {formatTime12(iv.startTime)} &nbsp;–&nbsp; {formatTime12(iv.endTime)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs sm:text-sm font-normal text-text-muted pt-0.5 font-sans">
                                Unavailable
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-[11px] text-text-muted">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Clock className="h-3.5 w-3.5 text-text-muted" />
                      <span>Time zone:</span>
                    </span>
                    <span className="font-semibold text-text-main">
                      {schedule?.timeZone || user?.timezone || "UTC"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Host Section */}
          <div
            className={`rounded-2xl transition-all duration-200 ${
              openSections.host
                ? "bg-blue-50/50 dark:bg-blue-950/25 overflow-hidden"
                : "rounded-xl overflow-hidden"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection("host")}
              className={`flex w-full items-center justify-between px-3.5 text-sm font-semibold transition-all cursor-pointer group ${
                openSections.host
                  ? "pt-3 pb-2 text-brand"
                  : "py-2.5 rounded-xl text-text-main hover:bg-blue-50/70 hover:text-brand dark:hover:bg-blue-950/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold group-hover:text-brand transition-colors">Host</span>
                <span className="text-xs font-normal text-text-muted group-hover:text-brand/80 transition-colors">
                  ({user?.name || "Host"})
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-text-muted group-hover:text-brand transition-transform duration-200 ${
                  openSections.host ? "rotate-180 text-brand" : ""
                }`}
              />
            </button>

            {openSections.host && (
              <div className="px-3.5 pt-1 pb-3.5 space-y-3 animate-in fade-in-50 duration-150">
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border-subtle bg-surface">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user?.name || "Host"}
                      className="h-10 w-10 rounded-full object-cover shrink-0 border border-border-subtle shadow-2xs"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                      {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-text-main truncate">
                      {user?.name || user?.username || "Host"}
                    </p>
                    <p className="text-[11px] text-text-sub truncate font-mono flex items-center gap-1">
                      <Mail className="h-3 w-3 text-text-muted shrink-0" />
                      <span>{user?.email || "No email provided"}</span>
                    </p>
                    <p className="text-[10px] text-text-muted mt-1 leading-tight">
                      Invites and notifications will be delivered from this account.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6. Booking Questions (Optional) */}
          <div
            className={`rounded-2xl transition-all duration-200 ${
              openSections.questions
                ? "bg-blue-50/50 dark:bg-blue-950/25 overflow-hidden"
                : "rounded-xl overflow-hidden"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection("questions")}
              className={`flex w-full items-center justify-between px-3.5 text-sm font-semibold transition-all cursor-pointer group ${
                openSections.questions
                  ? "pt-3 pb-2 text-brand"
                  : "py-2.5 rounded-xl text-text-main hover:bg-blue-50/70 hover:text-brand dark:hover:bg-blue-950/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold group-hover:text-brand transition-colors">Booking questions</span>
                <span className="text-xs font-normal text-text-muted group-hover:text-brand/80 transition-colors">
                  ({customQuestions.length})
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-text-muted group-hover:text-brand transition-transform duration-200 ${
                  openSections.questions ? "rotate-180 text-brand" : ""
                }`}
              />
            </button>

            {openSections.questions && (
              <div className="px-3.5 pt-1 pb-3.5 space-y-3 animate-in fade-in-50 duration-150">
                <p className="text-xs text-text-sub">
                  Ask invitees additional questions when they book a meeting.
                </p>

                {customQuestions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border-subtle bg-surface-subtle/40 p-4 text-center">
                    <p className="text-xs text-text-main font-medium">No custom questions added</p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Invitees will always be asked for their Name and Email address.
                    </p>
                  </div>
                )}

                {customQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border-subtle bg-surface-subtle/50 p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase text-text-muted">
                        Question {idx + 1} ({q.type === "SELECT" ? (q.allowMultiple ? "Multi-select" : "Select") : q.type})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(idx)}
                        className="text-text-muted hover:text-rose-600 p-1 cursor-pointer transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <Input
                      type="text"
                      value={q.label}
                      onChange={(e) => handleUpdateQuestion(idx, { label: e.target.value })}
                      placeholder={q.type === "SELECT" ? "e.g. Which topics would you like to discuss?" : "Enter your question…"}
                      className="h-8 text-xs rounded-lg border-border-subtle bg-surface text-text-main focus:border-brand"
                    />

                    {/* SELECT configuration: Single vs Multi choice and Option list */}
                    {q.type === "SELECT" && (
                      <div className="space-y-2.5 pt-2 border-t border-border-subtle">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-text-main">Selection type:</span>
                          <div className="flex items-center rounded-lg border border-border-subtle bg-surface p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuestion(idx, { allowMultiple: false })}
                              className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                                !q.allowMultiple
                                  ? "bg-brand text-white font-bold shadow-2xs"
                                  : "text-text-sub hover:text-text-main font-medium"
                              }`}
                            >
                              Single choice
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuestion(idx, { allowMultiple: true })}
                              className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                                q.allowMultiple
                                  ? "bg-brand text-white font-bold shadow-2xs"
                                  : "text-text-sub hover:text-text-main font-medium"
                              }`}
                            >
                              Multiple choice
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-text-main">Options (min 2)</span>
                            <button
                              type="button"
                              onClick={() => handleAddOption(idx)}
                              className="text-[11px] text-brand hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Add option</span>
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            {q.options?.map((opt, optIdx) => (
                              <div key={opt.id || optIdx} className="flex items-center gap-1.5">
                                <span className="text-[11px] text-text-muted font-mono w-4 shrink-0 text-center">
                                  {optIdx + 1}.
                                </span>
                                <Input
                                  type="text"
                                  value={opt.label}
                                  onChange={(e) => handleUpdateOption(idx, optIdx, e.target.value)}
                                  placeholder={`Option ${optIdx + 1}`}
                                  className="h-7 text-xs rounded-lg border-border-subtle bg-surface text-text-main flex-1 focus:border-brand"
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOption(idx, optIdx)}
                                  disabled={(q.options?.length || 0) <= 2}
                                  className="text-text-muted hover:text-rose-600 disabled:opacity-30 disabled:hover:text-text-muted p-1 cursor-pointer transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-xs text-text-main cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) =>
                          handleUpdateQuestion(idx, { required: e.target.checked })
                        }
                        className="rounded border-border-subtle text-brand focus:ring-brand"
                      />
                      <span>Required question</span>
                    </label>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddQuestion("TEXT")}
                    className="rounded-full border-border-subtle text-text-main hover:bg-surface-subtle text-xs gap-1.5 h-7 px-3 cursor-pointer"
                  >
                    <Plus className="h-3 w-3 text-text-muted" />
                    <span>Text</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddQuestion("TEXTAREA")}
                    className="rounded-full border-border-subtle text-text-main hover:bg-surface-subtle text-xs gap-1.5 h-7 px-3 cursor-pointer"
                  >
                    <Plus className="h-3 w-3 text-text-muted" />
                    <span>Paragraph</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddQuestion("SELECT")}
                    className="rounded-full border-border-subtle text-text-main hover:bg-surface-subtle text-xs gap-1.5 h-7 px-3 cursor-pointer"
                  >
                    <Plus className="h-3 w-3 text-text-muted" />
                    <span>Select</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SidePanel>
  );
}
