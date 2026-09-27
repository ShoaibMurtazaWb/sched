"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  X,
  MapPin,
  PhoneCall,
  Link2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  Trash2,
  AlertCircle,
  Eye,
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
import { api, apiUrl, type CurrentUser, type EventType } from "@/lib/api";
import { ApiError, fieldErrors } from "@/lib/api-error";
import type { LocationType, CustomQuestion, ScheduleResponse, ZoomIntegrationResponse } from "@sched/api-contract";

const DURATION_PRESETS = [15, 30, 45, 60];

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

  // Accordion Section States
  const [openSections, setOpenSections] = useState({
    duration: true,
    location: true,
    description: true,
    availability: true,
    host: true,
    questions: false,
  });

  // Form Fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [duration, setDuration] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState<string>("");
  const [description, setDescription] = useState("");

  // Location Fields
  const [locationType, setLocationType] = useState<LocationType>("ZOOM");
  const [inPersonAddress, setInPersonAddress] = useState("");
  const [displayPublicAddress, setDisplayPublicAddress] = useState(false);
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
      setLocationType("ZOOM");
      setInPersonAddress("");
      setDisplayPublicAddress(false);
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
            setDisplayPublicAddress(Boolean(locData.displayPublicAddress));
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

  function handleAddQuestion(type: "TEXT" | "TEXTAREA" | "SELECT" | "CHECKBOX") {
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
    } else if (type === "CHECKBOX") {
      setCustomQuestions((prev) => [
        ...prev,
        {
          id,
          type: "CHECKBOX",
          label: "I agree to the requirements",
          required: false,
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
          placeholder: "",
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

    if (locationType === "ZOOM" && isZoomConnected === false) {
      setError("Please connect your Zoom account first or choose another location.");
      setIsSaving(false);
      return;
    }

    // Construct Location Payload
    let locationData: Record<string, unknown> = {};
    if (locationType === "ZOOM") {
      locationData = {
        extraNotes: videoNotes,
      };
    } else if (locationType === "IN_PERSON") {
      locationData = {
        address: inPersonAddress,
        displayPublicAddress,
        extraNotes: inPersonNotes,
      };
    } else if (locationType === "CUSTOM_LINK" || (locationType as string) === "STATIC_VIDEO") {
      locationData = {
        url: customLinkUrl,
        extraNotes: customLinkNotes,
      };
    } else if (locationType === "HOST_CALLS_ATTENDEE") {
      locationData = {
        extraNotes: hostCallsAttendeeNotes,
      };
    } else if (locationType === "ATTENDEE_CALLS_HOST") {
      locationData = {
        hostPhoneNumber: attendeeCallsHostPhone,
        extraNotes: attendeeCallsHostNotes,
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
      if (caught instanceof ApiError) {
        setError(caught.message);
        setErrors(fieldErrors(caught));
      } else {
        setError("Failed to save event type. Please check all fields.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const effectiveSlug = (slug || generateSlug(title)).trim() || "meeting";
  const publicPreviewUrl =
    user && effectiveSlug ? `/public/${user.username}/${effectiveSlug}` : null;

  return (
    <div
      className={`transition-[width,opacity] duration-500 ease-in-out shrink-0 overflow-hidden ${
        isOpen
          ? "w-full md:w-[440px] lg:w-[480px] opacity-100"
          : "w-0 opacity-0 pointer-events-none"
      }`}
    >
      <aside
        className={`w-full md:w-[440px] lg:w-[480px] rounded-2xl border border-neutral-200 bg-white shadow-xl flex flex-col h-full min-h-[600px] max-h-[calc(100vh-8rem)] sticky top-6 transition-transform duration-500 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              {eventTypeId ? "Edit Event Type" : "New Event Type"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Title Identity Header - Directly Editable in Real-time with Bolder Divider */}
          <div className="space-y-1 pb-5 border-b-2 border-neutral-300">
            <div className="flex items-center gap-2.5">
              <span className="h-3.5 w-3.5 rounded-full bg-blue-600 shrink-0" />
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. 30 Minute Meeting"
                className="w-full text-xl font-bold tracking-tight text-black bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-blue-600 focus:outline-none transition-colors py-0.5 rounded-xs"
              />
            </div>
            {errors.title && <p className="text-[11px] text-rose-600 pl-6">{errors.title}</p>}
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4 py-8 text-center text-xs text-neutral-500">
              <Spinner size="default" />
              <p>Loading event details…</p>
            </div>
          ) : (
            <div className="space-y-5 divide-y divide-neutral-200">
              {/* 1. Duration Section */}
              <div className="pt-4 first:pt-0">
                <button
                  type="button"
                  onClick={() => toggleSection("duration")}
                  className="flex w-full items-center justify-between py-2 text-sm font-bold text-black hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span>Duration</span>
                    <span className="text-xs font-normal text-neutral-500">({duration} min)</span>
                  </div>
                  {openSections.duration ? (
                    <ChevronUp className="h-4 w-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  )}
                </button>

                {openSections.duration && (
                  <div className="mt-3 space-y-3 pb-2">
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
                              ? "bg-blue-600 text-white shadow-2xs font-bold"
                              : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                          }`}
                        >
                          {mins} min
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-neutral-600">Custom:</span>
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
                        className="h-8 w-24 text-xs rounded-lg border-neutral-300"
                      />
                      <span className="text-xs text-neutral-500">minutes</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Location Section (Zoom, In-person, Phone call, Custom link) */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => toggleSection("location")}
                  className="flex w-full items-center justify-between py-2 text-sm font-bold text-black hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span>Location</span>
                    <span className="text-xs font-normal text-neutral-500">
                      {locationType === "ZOOM"
                        ? "Zoom"
                        : locationType === "STATIC_VIDEO"
                        ? "Video link"
                        : locationType === "HOST_CALLS_ATTENDEE" || locationType === "ATTENDEE_CALLS_HOST"
                        ? "Phone call"
                        : locationType === "IN_PERSON"
                        ? "In-person"
                        : "Custom link"}
                    </span>
                  </div>
                  {openSections.location ? (
                    <ChevronUp className="h-4 w-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  )}
                </button>

                {openSections.location && (
                  <div className="mt-3 space-y-3 pb-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setLocationType("ZOOM")}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                          locationType === "ZOOM"
                            ? isZoomConnected === false
                              ? "border-amber-500 bg-amber-50/60 text-amber-900 shadow-2xs"
                              : "border-blue-600 bg-blue-50/60 text-blue-700 shadow-2xs"
                            : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                        }`}
                      >
                        <ZoomLogo className="h-4 w-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold">Zoom</span>
                            {isZoomConnected === false && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded">
                                Connect required
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-500 font-normal">Dynamic meeting room</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLocationType("IN_PERSON")}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                          locationType === "IN_PERSON"
                            ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-2xs"
                            : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                        }`}
                      >
                        <MapPin className="h-4 w-4 shrink-0 text-rose-600" />
                        <div>
                          <div className="font-bold">In-person</div>
                          <div className="text-[10px] text-neutral-500 font-normal">Physical address</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLocationType("HOST_CALLS_ATTENDEE")}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                          locationType === "HOST_CALLS_ATTENDEE" || locationType === "ATTENDEE_CALLS_HOST"
                            ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-2xs"
                            : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                        }`}
                      >
                        <PhoneCall className="h-4 w-4 shrink-0 text-emerald-600" />
                        <div>
                          <div className="font-bold">Phone call</div>
                          <div className="text-[10px] text-neutral-500 font-normal">Inbound / Outbound</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLocationType("CUSTOM_LINK")}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                          locationType === "CUSTOM_LINK"
                            ? "border-blue-600 bg-blue-50/60 text-blue-700 shadow-2xs"
                            : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                        }`}
                      >
                        <Link2 className="h-4 w-4 shrink-0 text-purple-600" />
                        <div>
                          <div className="font-bold">Custom link</div>
                          <div className="text-[10px] text-neutral-500 font-normal">Custom meeting room</div>
                        </div>
                      </button>
                    </div>

                    {/* Contextual Location Inputs */}
                    {locationType === "ZOOM" && (
                      isZoomConnected === false ? (
                        <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-3">
                          <div className="flex items-start gap-2.5">
                            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-1 flex-1">
                              <p className="font-bold text-amber-900">Zoom Account Not Connected</p>
                              <p className="text-[11px] text-amber-800 leading-relaxed font-normal">
                                You must connect your Zoom account to Sched before using Zoom as a meeting location. Connect it below, or choose another meeting location above.
                              </p>
                            </div>
                          </div>

                          <div className="pt-0.5">
                            <a
                              href={apiUrl("/integrations/zoom/connect")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#2D8CFF] hover:bg-blue-600 text-white font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
                            >
                              <ZoomLogo className="h-3.5 w-3.5" />
                              <span>Connect Zoom</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 text-xs text-blue-900 space-y-1 pt-2">
                          <div className="flex items-center gap-2 font-semibold text-blue-800">
                            <ZoomLogo className="h-4 w-4 shrink-0" />
                            <span>Zoom Video Integration Connected</span>
                          </div>
                          <p className="text-[11px] text-blue-700 leading-relaxed font-normal">
                            Sched will automatically generate a dynamic Zoom meeting and include the unique join link in the calendar invite and confirmation email upon booking.
                          </p>
                        </div>
                      )
                    )}


                    {locationType === "IN_PERSON" && (
                      <div className="space-y-2 pt-1">
                        <Label htmlFor="drawer-address" className="text-xs font-semibold text-neutral-800">
                          Physical address / Location details
                        </Label>
                        <Input
                          id="drawer-address"
                          type="text"
                          value={inPersonAddress}
                          onChange={(e) => setInPersonAddress(e.target.value)}
                          placeholder="e.g. 123 Main St, Suite 400"
                          className="h-9 text-xs rounded-xl border-neutral-300 focus:border-blue-600"
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="checkbox"
                            id="drawer-display-address"
                            checked={displayPublicAddress}
                            onChange={(e) => setDisplayPublicAddress(e.target.checked)}
                            className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                          />
                          <Label htmlFor="drawer-display-address" className="text-xs text-neutral-600 cursor-pointer">
                            Display exact address publicly before booking
                          </Label>
                        </div>
                      </div>
                    )}

                    {(locationType === "HOST_CALLS_ATTENDEE" || locationType === "ATTENDEE_CALLS_HOST") && (
                      <div className="space-y-2.5 pt-1">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setLocationType("HOST_CALLS_ATTENDEE")}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border ${
                              locationType === "HOST_CALLS_ATTENDEE"
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                            }`}
                          >
                            I will call attendee
                          </button>
                          <button
                            type="button"
                            onClick={() => setLocationType("ATTENDEE_CALLS_HOST")}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border ${
                              locationType === "ATTENDEE_CALLS_HOST"
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                            }`}
                          >
                            Attendee calls me
                          </button>
                        </div>
                        {locationType === "ATTENDEE_CALLS_HOST" && (
                          <div className="space-y-1">
                            <Label htmlFor="drawer-phone" className="text-xs font-semibold text-neutral-800">
                              Your phone number
                            </Label>
                            <Input
                              id="drawer-phone"
                              type="tel"
                              value={attendeeCallsHostPhone}
                              onChange={(e) => setAttendeeCallsHostPhone(e.target.value)}
                              placeholder="+1 (555) 000-0000"
                              className="h-9 text-xs rounded-xl border-neutral-300"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {locationType === "CUSTOM_LINK" && (
                      <div className="space-y-1.5 pt-1">
                        <Label htmlFor="drawer-custom-url" className="text-xs font-semibold text-neutral-800">
                          Custom meeting URL
                        </Label>
                        <Input
                          id="drawer-custom-url"
                          type="url"
                          value={customLinkUrl}
                          onChange={(e) => setCustomLinkUrl(e.target.value)}
                          placeholder="https://custom-room.example.com/meet"
                          className="h-9 text-xs rounded-xl border-neutral-300 focus:border-blue-600"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Description Section */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => toggleSection("description")}
                  className="flex w-full items-center justify-between py-2 text-sm font-bold text-black hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <span>Description</span>
                  {openSections.description ? (
                    <ChevronUp className="h-4 w-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  )}
                </button>

                {openSections.description && (
                  <div className="mt-3 space-y-3 pb-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="drawer-desc" className="text-xs font-semibold text-neutral-800">
                        Description / Instructions
                      </Label>
                      <Textarea
                        id="drawer-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Write a summary and details for invitees…"
                        rows={3}
                        className="text-xs rounded-xl border-neutral-300 focus:border-blue-600 resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Availability Section (Full Timetable) */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => toggleSection("availability")}
                  className="flex w-full items-center justify-between py-2 text-sm font-bold text-black hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <span>Availability</span>
                  {openSections.availability ? (
                    <ChevronUp className="h-4 w-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  )}
                </button>

                {openSections.availability && (
                  <div className="mt-3 space-y-3 pb-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-neutral-700 font-semibold">
                        <Calendar className="h-3.5 w-3.5 text-neutral-500" />
                        <span>{schedule?.name || "Working hours (Default)"}</span>
                      </div>
                      <Link
                        href="/dashboard/availability"
                        className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        <span>Edit schedule</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>

                    {/* Whole Timetable Display matching screenshot */}
                    <div className="rounded-2xl border border-neutral-200/80 bg-slate-50/50 p-4 space-y-4">
                      <div className="space-y-3.5">
                        {WEEK_DAYS.map((dayItem) => {
                          const intervals = schedule?.days?.filter(
                            (d) => d.dayOfWeek === dayItem.day
                          ) || [];
                          const isAvailable = intervals.length > 0;

                          return (
                            <div
                              key={dayItem.day}
                              className="flex items-start gap-4 py-0.5"
                            >
                              {/* Day Circle Icon Badge */}
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0a2540] text-white font-bold text-xs shrink-0 select-none shadow-2xs">
                                {dayItem.short}
                              </div>

                              {/* Time Intervals List or Unavailable */}
                              <div className="min-w-0 flex-1">
                                {isAvailable ? (
                                  <div className="space-y-1.5 pt-0.5">
                                    {intervals.map((iv, idx) => (
                                      <div
                                        key={idx}
                                        className="text-xs sm:text-sm font-medium text-slate-800 tracking-tight font-sans"
                                      >
                                        {formatTime12(iv.startTime)} &nbsp;-&nbsp; {formatTime12(iv.endTime)}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs sm:text-sm font-normal text-slate-500 pt-0.5 font-sans">
                                    Unavailable
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pt-3 border-t border-neutral-200/80 flex items-center justify-between text-[11px] text-neutral-500">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Clock className="h-3.5 w-3.5 text-neutral-400" />
                          <span>Time zone:</span>
                        </span>
                        <span className="font-semibold text-neutral-800">
                          {schedule?.timeZone || user?.timezone || "UTC"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Host Section */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => toggleSection("host")}
                  className="flex w-full items-center justify-between py-2 text-sm font-bold text-black hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <span>Host</span>
                  {openSections.host ? (
                    <ChevronUp className="h-4 w-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  )}
                </button>

                {openSections.host && (
                  <div className="mt-3 space-y-3 pb-2">
                    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70">
                      {user?.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user?.name || "Host"}
                          className="h-10 w-10 rounded-full object-cover shrink-0 border border-neutral-200 shadow-2xs"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                          {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-black truncate">
                          {user?.name || user?.username || "Host"}
                        </p>
                        <p className="text-[11px] text-neutral-600 truncate font-mono flex items-center gap-1">
                          <Mail className="h-3 w-3 text-neutral-400 shrink-0" />
                          <span>{user?.email || "No email provided"}</span>
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-1 leading-tight">
                          Invites and booking notifications will be delivered from this email.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 7. Booking Questions (Optional) */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => toggleSection("questions")}
                  className="flex w-full items-center justify-between py-2 text-sm font-bold text-black hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span>Booking questions</span>
                    <span className="text-xs font-normal text-neutral-500">
                      ({customQuestions.length})
                    </span>
                  </div>
                  {openSections.questions ? (
                    <ChevronUp className="h-4 w-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  )}
                </button>

                {openSections.questions && (
                  <div className="mt-3 space-y-3 pb-2">
                    <p className="text-xs text-neutral-500">
                      Ask invitees additional questions when they book a meeting.
                    </p>

                    {customQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase text-neutral-600">
                            Question {idx + 1} ({q.type === "SELECT" ? (q.allowMultiple ? "Multi-select" : "Select") : q.type})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(idx)}
                            className="text-neutral-400 hover:text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <Input
                          type="text"
                          value={q.label}
                          onChange={(e) => handleUpdateQuestion(idx, { label: e.target.value })}
                          placeholder={q.type === "SELECT" ? "e.g. Which topics would you like to discuss?" : "Enter your question…"}
                          className="h-8 text-xs rounded-lg border-neutral-300 bg-white"
                        />

                        {/* SELECT configuration: Single vs Multi choice and Option list */}
                        {q.type === "SELECT" && (
                          <div className="space-y-2.5 pt-2 border-t border-neutral-200/80">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-neutral-700">Selection type:</span>
                              <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuestion(idx, { allowMultiple: false })}
                                  className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                                    !q.allowMultiple
                                      ? "bg-white text-blue-600 font-bold shadow-2xs"
                                      : "text-neutral-600 hover:text-neutral-900 font-medium"
                                  }`}
                                >
                                  Single choice
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuestion(idx, { allowMultiple: true })}
                                  className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                                    q.allowMultiple
                                      ? "bg-white text-blue-600 font-bold shadow-2xs"
                                      : "text-neutral-600 hover:text-neutral-900 font-medium"
                                  }`}
                                >
                                  Multiple choice
                                </button>
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-neutral-700">Options (min 2)</span>
                                <button
                                  type="button"
                                  onClick={() => handleAddOption(idx)}
                                  className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="h-3 w-3" />
                                  <span>Add option</span>
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                {q.options?.map((opt, optIdx) => (
                                  <div key={opt.id || optIdx} className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-neutral-400 font-mono w-4 shrink-0 text-center">
                                      {optIdx + 1}.
                                    </span>
                                    <Input
                                      type="text"
                                      value={opt.label}
                                      onChange={(e) => handleUpdateOption(idx, optIdx, e.target.value)}
                                      placeholder={`Option ${optIdx + 1}`}
                                      className="h-7 text-xs rounded-lg border-neutral-300 bg-white flex-1"
                                      required
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOption(idx, optIdx)}
                                      disabled={(q.options?.length || 0) <= 2}
                                      className="text-neutral-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-neutral-400 p-1 cursor-pointer"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer pt-0.5">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) =>
                              handleUpdateQuestion(idx, { required: e.target.checked })
                            }
                            className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
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
                        className="rounded-full border-neutral-300 text-xs gap-1.5 h-7 px-3 cursor-pointer"
                      >
                        <Plus className="h-3 w-3 text-neutral-600" />
                        <span>Text</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddQuestion("TEXTAREA")}
                        className="rounded-full border-neutral-300 text-xs gap-1.5 h-7 px-3 cursor-pointer"
                      >
                        <Plus className="h-3 w-3 text-neutral-600" />
                        <span>Paragraph</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddQuestion("SELECT")}
                        className="rounded-full border-neutral-300 text-xs gap-1.5 h-7 px-3 cursor-pointer"
                      >
                        <Plus className="h-3 w-3 text-neutral-600" />
                        <span>Select / Dropdown</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddQuestion("CHECKBOX")}
                        className="rounded-full border-neutral-300 text-xs gap-1.5 h-7 px-3 cursor-pointer"
                      >
                        <Plus className="h-3 w-3 text-neutral-600" />
                        <span>Checkbox</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Sticky Bottom Action Bar */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4 flex items-center justify-between gap-3 shrink-0 rounded-b-2xl">
          <div>
            {publicPreviewUrl ? (
              <Link
                href={publicPreviewUrl}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 hover:text-black transition-colors"
              >
                <Eye className="h-3.5 w-3.5 text-neutral-500" />
                <span>Preview</span>
              </Link>
            ) : (
              <span className="text-xs text-neutral-400">Preview</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {locationType === "ZOOM" && isZoomConnected === false && (
              <span className="text-xs text-amber-600 font-medium mr-1 hidden sm:inline">
                Connect Zoom to continue
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-full border-neutral-300 text-xs font-semibold px-4"
            >
              Cancel
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={isSaving || !title.trim() || (locationType === "ZOOM" && isZoomConnected === false)}
              className="rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 shadow-2xs gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Spinner size="sm" />
                  <span>Saving…</span>
                </>
              ) : (
                <span>{eventTypeId ? "Save changes" : "Create event"}</span>
              )}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
