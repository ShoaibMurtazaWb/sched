"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Link2,
  MapPin,
  PhoneCall,
  PhoneForwarded,
  Globe,
  AlertCircle,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  createEventTypeBodySchema,
  updateEventTypeBodySchema,
  type EventTypeLocationConfig,
  type LocationType,
  type ZoomIntegrationResponse,
} from "@sched/api-contract";
import { ZoomLogo } from "@/components/zoom-logo";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { api, apiUrl, type CurrentUser, type EventType } from "@/lib/api";
import { ApiError, fieldErrors, formatApiError } from "@/lib/api-error";

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

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface EventTypeFormProps {
  eventTypeId?: string;
}

export function EventTypeForm({ eventTypeId }: EventTypeFormProps) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(Boolean(eventTypeId));
  const [isLegacyMissingLocation, setIsLegacyMissingLocation] = useState(false);

  // Controlled form values
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [duration, setDuration] = useState<number>(30);
  const [description, setDescription] = useState("");
  const [isSlugTouched, setIsSlugTouched] = useState(false);

  // Location state
  const [locationType, setLocationType] = useState<LocationType>("ZOOM");
  const [inPersonAddress, setInPersonAddress] = useState("");
  const [inPersonNotes, setInPersonNotes] = useState("");
  const [videoNotes, setVideoNotes] = useState("");
  const [customLinkUrl, setCustomLinkUrl] = useState("");
  const [customLinkNotes, setCustomLinkNotes] = useState("");
  const [hostCallsAttendeeNotes, setHostCallsAttendeeNotes] = useState("");
  const [attendeeCallsHostPhone, setAttendeeCallsHostPhone] = useState("");
  const [attendeeCallsHostNotes, setAttendeeCallsHostNotes] = useState("");

  // Custom Questions state
  const [customQuestions, setCustomQuestions] = useState<
    Array<{
      id?: string;
      type: "TEXT" | "TEXTAREA" | "SELECT" | "CHECKBOX";
      label: string;
      required: boolean;
      allowMultiple?: boolean;
      placeholder?: string;
      options?: Array<{ id?: string; label: string }>;
    }>
  >([]);

  // Zoom connection state
  const [isZoomConnected, setIsZoomConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkZoom = () => {
      api<ZoomIntegrationResponse | null>("/integrations/zoom")
        .then((res) => {
          if (mounted) {
            setIsZoomConnected(Boolean(res && res.status === "CONNECTED"));
          }
        })
        .catch(() => {
          if (mounted) setIsZoomConnected(false);
        });
    };

    checkZoom();
    window.addEventListener("focus", checkZoom);
    return () => {
      mounted = false;
      window.removeEventListener("focus", checkZoom);
    };
  }, []);

  useEffect(() => {
    api<CurrentUser>("/auth/me").then(setUser).catch(() => {});

    if (!eventTypeId) {
      setLoadingInitial(false);
      return;
    }

    setLoadingInitial(true);
    api<EventType>(`/event-types/${eventTypeId}`)
      .then((data) => {
        setTitle(data.title);
        setSlug(data.slug);
        setDuration(data.durationMinutes);
        setDescription(data.description || "");
        setIsSlugTouched(true);

        if (data.customQuestions && Array.isArray(data.customQuestions)) {
          setCustomQuestions(data.customQuestions);
        }

        if (data.location) {
          setLocationType(data.location.type as LocationType);
          const locData = data.location.data as Record<string, unknown>;
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
          setIsLegacyMissingLocation(true);
        }
      })
      .catch(() => setError("Event type not found."))
      .finally(() => setLoadingInitial(false));
  }, [eventTypeId]);

  async function handleDelete() {
    if (!eventTypeId) return;
    if (!window.confirm("Are you sure you want to permanently delete this event type? This action cannot be undone.")) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api(`/event-types/${eventTypeId}`, { method: "DELETE" });
      toast.success("Event type deleted permanently");
      router.push("/dashboard");
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        toast.error("Cannot delete event type", caught.message);
      } else {
        setError("Could not delete the event type.");
        toast.error("Could not delete the event type");
      }
    } finally {
      setPending(false);
    }
  }

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!isSlugTouched && !eventTypeId) {
      setSlug(generateSlug(val));
    }
  }

  function handleAddQuestion(type: "TEXT" | "TEXTAREA" | "SELECT") {
    if (type === "SELECT") {
      setCustomQuestions((prev) => [
        ...prev,
        {
          type: "SELECT",
          label: "",
          required: false,
          allowMultiple: false,
          options: [
            { label: "Option 1" },
            { label: "Option 2" },
          ],
        },
      ]);
    } else {
      setCustomQuestions((prev) => [
        ...prev,
        {
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

  function handleUpdateQuestion(
    index: number,
    patch: Partial<{
      label: string;
      required: boolean;
      allowMultiple?: boolean;
      placeholder?: string;
      options?: Array<{ id?: string; label: string }>;
    }>
  ) {
    setCustomQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );
  }

  function handleAddOption(questionIndex: number) {
    setCustomQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== questionIndex) return q;
        const currentOpts = q.options || [];
        return {
          ...q,
          options: [...currentOpts, { label: `Option ${currentOpts.length + 1}` }],
        };
      })
    );
  }

  function handleRemoveOption(questionIndex: number, optionIndex: number) {
    setCustomQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== questionIndex) return q;
        const currentOpts = q.options || [];
        if (currentOpts.length <= 2) {
          toast.error("Select question must have at least 2 options.");
          return q;
        }
        return {
          ...q,
          options: currentOpts.filter((_, optIdx) => optIdx !== optionIndex),
        };
      })
    );
  }

  function handleUpdateOption(questionIndex: number, optionIndex: number, label: string) {
    setCustomQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== questionIndex) return q;
        const currentOpts = q.options || [];
        return {
          ...q,
          options: currentOpts.map((opt, optIdx) =>
            optIdx === optionIndex ? { ...opt, label } : opt
          ),
        };
      })
    );
  }

  function buildLocationConfig(): EventTypeLocationConfig {
    switch (locationType) {
      case "ZOOM":
        return {
          type: "ZOOM",
          data: {
            extraNotes: videoNotes || undefined,
          },
        };
      case "IN_PERSON":
        return {
          type: "IN_PERSON",
          data: {
            address: inPersonAddress.trim(),
            displayPublicAddress: true,
            extraNotes: inPersonNotes || undefined,
          },
        };
      case "HOST_CALLS_ATTENDEE":
        return {
          type: "HOST_CALLS_ATTENDEE",
          data: {
            extraNotes: hostCallsAttendeeNotes || undefined,
          },
        };
      case "ATTENDEE_CALLS_HOST":
        return {
          type: "ATTENDEE_CALLS_HOST",
          data: {
            hostPhoneNumber: attendeeCallsHostPhone.trim(),
            extraNotes: attendeeCallsHostNotes || undefined,
          },
        };
      case "CUSTOM_LINK":
      case "STATIC_VIDEO":
      default: {
        const formattedUrl = /^https?:\/\//i.test(customLinkUrl.trim())
          ? customLinkUrl.trim()
          : `https://${customLinkUrl.trim()}`;
        return {
          type: "CUSTOM_LINK",
          data: {
            url: formattedUrl,
            extraNotes: customLinkNotes || undefined,
          },
        };
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});

    const nextErrors: Record<string, string> = {};

    if (!title.trim()) {
      nextErrors.title = "Event title is required";
    }

    if (locationType === "IN_PERSON") {
      const addrErr = validateInPersonAddress(inPersonAddress);
      if (addrErr) nextErrors["location.data.address"] = addrErr;
    } else if (locationType === "CUSTOM_LINK") {
      const urlErr = validateCustomUrl(customLinkUrl);
      if (urlErr) nextErrors["location.data.url"] = urlErr;
    } else if (locationType === "ATTENDEE_CALLS_HOST") {
      if (!attendeeCallsHostPhone.trim()) {
        nextErrors["location.data.hostPhoneNumber"] = "Phone number is required";
      } else if (attendeeCallsHostPhone.trim().length < 7) {
        nextErrors["location.data.hostPhoneNumber"] = "Please enter a valid phone number";
      }
    } else if (locationType === "ZOOM" && isZoomConnected === false) {
      nextErrors.location = "Please connect your Zoom account first or choose another location.";
    }

    const locationConfig = buildLocationConfig();

    const raw = {
      title: title.trim(),
      slug: (slug || generateSlug(title)).trim() || "meeting",
      description: description.trim(),
      durationMinutes: duration,
      location: locationConfig,
      customQuestions: customQuestions.length > 0 ? customQuestions : undefined,
    };

    const parsed = eventTypeId
      ? updateEventTypeBodySchema.safeParse(raw)
      : createEventTypeBodySchema.safeParse(raw);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const pathKey = issue.path.join(".");
        if (!nextErrors[pathKey]) nextErrors[pathKey] = issue.message;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFields(nextErrors);
      if (nextErrors.title) {
        document.getElementById("title")?.focus();
      } else if (nextErrors["location.data.address"] || nextErrors.inPersonAddress) {
        document.getElementById("inPersonAddress")?.focus();
      } else if (nextErrors["location.data.url"] || nextErrors.customLinkUrl) {
        document.getElementById("customLinkUrl")?.focus();
      } else if (nextErrors["location.data.hostPhoneNumber"] || nextErrors.attendeeCallsHostPhone) {
        document.getElementById("attendeeCallsHostPhone")?.focus();
      } else if (nextErrors.slug) {
        document.getElementById("slug")?.focus();
      } else if (nextErrors.description) {
        document.getElementById("description")?.focus();
      }
      return;
    }

    setPending(true);
    try {
      if (eventTypeId) {
        await api(`/event-types/${eventTypeId}`, {
          method: "PATCH",
          body: JSON.stringify(parsed.data),
        });
        toast.success("Event type updated", "Changes saved successfully.");
      } else {
        await api("/event-types", {
          method: "POST",
          body: JSON.stringify(parsed.data),
        });
        toast.success("Event type created", "Your new booking link is live.");
      }
      router.push("/dashboard");
    } catch (caught) {
      const serverFields = fieldErrors(caught);
      if (
        serverFields.slug ||
        (caught instanceof ApiError && caught.body.error?.code === "EVENT_TYPE_SLUG_CONFLICT")
      ) {
        setFields((prev) => ({
          ...prev,
          title: "You already have an event type with this title in your account. Please choose a different title.",
        }));
        document.getElementById("title")?.focus();
      } else if (Object.keys(serverFields).length > 0) {
        setFields((prev) => ({ ...prev, ...serverFields }));
        if (serverFields.title) {
          document.getElementById("title")?.focus();
        } else if (serverFields.address || serverFields["location.data.address"]) {
          document.getElementById("inPersonAddress")?.focus();
        } else if (serverFields.url || serverFields["location.data.url"]) {
          document.getElementById("customLinkUrl")?.focus();
        } else if (serverFields.hostPhoneNumber || serverFields["location.data.hostPhoneNumber"]) {
          document.getElementById("attendeeCallsHostPhone")?.focus();
        } else if (serverFields.slug) {
          document.getElementById("slug")?.focus();
        }
      } else {
        const userMessage = formatApiError(
          caught,
          eventTypeId
            ? "Unable to update event. Please try again."
            : "Unable to create event. Please try again."
        );
        toast.error(
          eventTypeId ? "Unable to update event" : "Unable to create event",
          userMessage
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (loadingInitial) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-96 rounded-xl border border-[var(--border-subtle)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 mb-6 group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform duration-150" />
          Back to Event Types
        </Link>

        {/* Legacy Missing Location Alert */}
        {isLegacyMissingLocation && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Location Required</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-400">
                This legacy event type has no location configured. Please configure a meeting location below before saving changes.
              </p>
            </div>
          </div>
        )}

        {/* Form Card */}
        <Card className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xs">
          <div className="pb-5 border-b border-[var(--border-subtle)]">
            <CardTitle className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              {eventTypeId ? "Edit Event Type" : "Create New Event Type"}
            </CardTitle>
            <CardDescription className="mt-1 text-xs text-[var(--text-muted)]">
              Configure duration, booking slug, location details, and attendee guidelines.
            </CardDescription>
          </div>

          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            {/* Title Field */}
            <div className="space-y-1.5">
              <Label htmlFor="title">Event Title</Label>
              <Input
                id="title"
                name="title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. 30-Minute Strategy Session"
                required
                aria-invalid={Boolean(fields.title)}
              />
              {fields.title && (
                <p className="text-xs text-[var(--status-danger-text)] font-medium">{fields.title}</p>
              )}
            </div>

            {/* URL Slug Field */}
            <div className="space-y-1.5">
              <Label htmlFor="slug">URL Slug</Label>
              <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] focus-within:border-[var(--border-focus)] focus-within:ring-1 focus-within:ring-[var(--focus-ring)] focus-within:bg-[var(--bg-surface)] overflow-hidden shadow-2xs transition-[border-color,box-shadow,background-color] duration-150 ease-out">
                <span className="flex items-center gap-1.5 px-3 text-xs text-[var(--text-muted)] font-mono select-none">
                  <Link2 className="h-3.5 w-3.5" />
                  sched.com/public/@{user?.username || "username"}/
                </span>
                <input
                  id="slug"
                  name="slug"
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setIsSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="intro-call"
                  required
                  className="w-full bg-transparent py-2 pr-3 text-xs font-mono text-[var(--text-primary)] outline-none"
                />
              </div>
              {fields.slug && (
                <p className="text-xs text-[var(--status-danger-text)] font-medium">{fields.slug}</p>
              )}
            </div>

            {/* Location Selection Section */}
            <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
              <div>
                <Label>Location & Conferencing</Label>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Choose how you and your attendee will connect for this meeting.
                </p>
              </div>

              {/* Location Type Option Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: "ZOOM" as LocationType,
                    label: "Zoom Video",
                    desc: "Dynamic Zoom room",
                    icon: ZoomLogo,
                  },
                  {
                    id: "IN_PERSON" as LocationType,
                    label: "In-Person",
                    desc: "Physical address / venue",
                    icon: MapPin,
                  },
                  {
                    id: "HOST_CALLS_ATTENDEE" as LocationType,
                    label: "Host Calls Attendee",
                    desc: "Attendee provides phone",
                    icon: PhoneCall,
                  },
                  {
                    id: "ATTENDEE_CALLS_HOST" as LocationType,
                    label: "Attendee Calls Host",
                    desc: "You provide your phone",
                    icon: PhoneForwarded,
                  },
                  {
                    id: "CUSTOM_LINK" as LocationType,
                    label: "Custom Web Link",
                    desc: "Custom meeting room URL",
                    icon: Globe,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = locationType === item.id;
                  const isZoomDisconnected = item.id === "ZOOM" && isZoomConnected === false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLocationType(item.id)}
                      className={`flex flex-col items-start text-left p-3 rounded-xl border text-xs transition-colors cursor-pointer relative ${
                        isSelected
                          ? isZoomDisconnected
                            ? "border-amber-500 bg-amber-50/60 dark:border-amber-500 dark:bg-amber-950/20 text-[var(--text-primary)] font-semibold ring-1 ring-amber-500"
                            : "border-neutral-900 bg-neutral-900/5 dark:border-white dark:bg-white/10 text-[var(--text-primary)] font-semibold ring-1 ring-neutral-900 dark:ring-white"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-neutral-400"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <Icon className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />
                        {isZoomDisconnected && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/90 dark:text-amber-300 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                            Connect required
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-[var(--text-primary)]">{item.label}</span>
                      <span className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">{item.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Conditional Sub-forms per Location Type */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 p-4 space-y-3 mt-2">
                {locationType === "ZOOM" && (
                  isZoomConnected === false ? (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <p className="font-bold">Zoom Account Not Connected</p>
                          <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed font-normal">
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
                    <div className="space-y-2 text-xs text-[var(--text-secondary)]">
                      <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                        <ZoomLogo className="h-4 w-4 shrink-0" />
                        <span>Zoom Video Integration</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                        Sched will automatically generate a dynamic, password-protected Zoom meeting for every confirmed booking. The unique join link, meeting ID, and passcode will be included directly in the invitee&apos;s email and calendar invite.
                      </p>
                      <div className="space-y-1 pt-1">
                        <Label htmlFor="zoomNotes">Meeting Notes / Agenda (Optional)</Label>
                        <Input
                          id="zoomNotes"
                          value={videoNotes}
                          onChange={(e) => setVideoNotes(e.target.value)}
                          placeholder="e.g. Please join prepared with your project outline."
                        />
                      </div>
                    </div>
                  )
                )}
                {locationType === "IN_PERSON" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="inPersonAddress">
                        Venue / Street Address <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="inPersonAddress"
                        value={inPersonAddress}
                        onChange={(e) => {
                          setInPersonAddress(e.target.value);
                          if (fields["location.data.address"] || fields.inPersonAddress) {
                            setFields((prev) => {
                              const copy = { ...prev };
                              delete copy["location.data.address"];
                              delete copy.inPersonAddress;
                              return copy;
                            });
                          }
                        }}
                        placeholder="e.g. 100 Montgomery St, Suite 400, San Francisco, CA"
                        required
                        aria-invalid={Boolean(fields["location.data.address"] || fields.inPersonAddress)}
                      />
                      {(fields["location.data.address"] || fields.inPersonAddress) && (
                        <p className="text-xs text-[var(--status-danger-text)] font-medium">
                          {fields["location.data.address"] || fields.inPersonAddress}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1 pt-1">
                      <Label htmlFor="inPersonNotes">Arrival / Parking Instructions (Optional)</Label>
                      <Input
                        id="inPersonNotes"
                        value={inPersonNotes}
                        onChange={(e) => setInPersonNotes(e.target.value)}
                        placeholder="e.g. Buzz suite #400 at the front lobby."
                      />
                    </div>
                  </>
                )}


                {locationType === "CUSTOM_LINK" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="customLinkUrl">
                        Custom Meeting URL <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="customLinkUrl"
                        value={customLinkUrl}
                        onChange={(e) => {
                          setCustomLinkUrl(e.target.value);
                          if (fields["location.data.url"] || fields.customLinkUrl) {
                            setFields((prev) => {
                              const copy = { ...prev };
                              delete copy["location.data.url"];
                              delete copy.customLinkUrl;
                              return copy;
                            });
                          }
                        }}
                        placeholder="https://app.customroom.com/your-room"
                        required
                        aria-invalid={Boolean(fields["location.data.url"] || fields.customLinkUrl)}
                      />
                      {(fields["location.data.url"] || fields.customLinkUrl) && (
                        <p className="text-xs text-[var(--status-danger-text)] font-medium">
                          {fields["location.data.url"] || fields.customLinkUrl}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1 pt-1">
                      <Label htmlFor="customLinkNotes">Instructions (Optional)</Label>
                      <Input
                        id="customLinkNotes"
                        value={customLinkNotes}
                        onChange={(e) => setCustomLinkNotes(e.target.value)}
                        placeholder="e.g. Please join 2 minutes early for audio setup."
                      />
                    </div>
                  </>
                )}

                {locationType === "HOST_CALLS_ATTENDEE" && (
                  <div className="space-y-2 text-xs text-[var(--text-secondary)]">
                    <p className="font-semibold text-[var(--text-primary)]">You will call the attendee</p>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      At booking time, the attendee will be asked to provide their phone number. You will receive their number in your booking alert and calendar invite.
                    </p>
                    <div className="space-y-1 pt-1">
                      <Label htmlFor="hostCallsAttendeeNotes">Notes for Attendee (Optional)</Label>
                      <Input
                        id="hostCallsAttendeeNotes"
                        value={hostCallsAttendeeNotes}
                        onChange={(e) => setHostCallsAttendeeNotes(e.target.value)}
                        placeholder="e.g. I will dial you directly at the scheduled time."
                      />
                    </div>
                  </div>
                )}

                {locationType === "ATTENDEE_CALLS_HOST" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="attendeeCallsHostPhone">Your Phone Number</Label>
                      <Input
                        id="attendeeCallsHostPhone"
                        value={attendeeCallsHostPhone}
                        onChange={(e) => {
                          setAttendeeCallsHostPhone(e.target.value);
                          if (fields["location.data.hostPhoneNumber"] || fields.attendeeCallsHostPhone) {
                            setFields((prev) => {
                              const copy = { ...prev };
                              delete copy["location.data.hostPhoneNumber"];
                              delete copy.attendeeCallsHostPhone;
                              return copy;
                            });
                          }
                        }}
                        placeholder="+1 (555) 123-4567"
                        required
                        aria-invalid={Boolean(fields["location.data.hostPhoneNumber"] || fields.attendeeCallsHostPhone)}
                      />
                      {(fields["location.data.hostPhoneNumber"] || fields.attendeeCallsHostPhone) && (
                        <p className="text-xs text-[var(--status-danger-text)] font-medium">
                          {fields["location.data.hostPhoneNumber"] || fields.attendeeCallsHostPhone}
                        </p>
                      )}
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Private number: shown only to confirmed attendees after booking.
                      </p>
                    </div>
                    <div className="space-y-1 pt-1">
                      <Label htmlFor="attendeeCallsHostNotes">Dial-in Notes (Optional)</Label>
                      <Input
                        id="attendeeCallsHostNotes"
                        value={attendeeCallsHostNotes}
                        onChange={(e) => setAttendeeCallsHostNotes(e.target.value)}
                        placeholder="e.g. Please ask for my extension #104."
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Duration Field with Presets */}
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between">
                <Label htmlFor="durationMinutes">Duration</Label>
                <span className="text-xs text-[var(--text-muted)] tabular-nums font-sans">
                  {duration} minutes
                </span>
              </div>

              {/* Quick Duration Preset Pills */}
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDuration(preset)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums font-sans transition-[background-color,border-color,color] duration-150 ease-out cursor-pointer ${
                      duration === preset
                        ? "bg-neutral-900 text-white shadow-2xs border border-transparent dark:bg-white dark:text-neutral-900"
                        : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    <span>{preset} min</span>
                  </button>
                ))}
              </div>

              {/* Custom Numeric Input */}
              <Input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={5}
                max={480}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                required
                className="mt-2 tabular-nums"
                aria-invalid={Boolean(fields.durationMinutes)}
              />
              {fields.durationMinutes && (
                <p className="text-xs text-[var(--status-danger-text)] font-medium">
                  {fields.durationMinutes}
                </p>
              )}
            </div>

            {/* Custom Booking Questions Section */}
            <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Custom Booking Questions</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Ask attendees for extra details or confirmations when booking this meeting.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => handleAddQuestion("TEXT")}
                  >
                    <Plus className="h-3 w-3" />
                    <span>Text</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => handleAddQuestion("TEXTAREA")}
                  >
                    <Plus className="h-3 w-3" />
                    <span>Paragraph</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => handleAddQuestion("SELECT")}
                  >
                    <Plus className="h-3 w-3" />
                    <span>Select</span>
                  </Button>
                </div>
              </div>

              {customQuestions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-4 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-canvas)]">
                  No custom questions configured. Attendees will only be asked for Name, Email, Timezone, and Notes.
                </div>
              ) : (
                <div className="space-y-3">
                  {customQuestions.map((q, qIndex) => (
                    <div
                      key={q.id || `temp_q_${qIndex}`}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-3 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            {q.type}
                          </span>
                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                            Question #{qIndex + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) =>
                                handleUpdateQuestion(qIndex, { required: e.target.checked })
                              }
                              className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 h-3.5 w-3.5"
                            />
                            <span>Required</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(qIndex)}
                            className="text-[var(--text-muted)] hover:text-red-600 transition-colors p-1"
                            title="Remove Question"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Question Prompt / Label</Label>
                          <Input
                            value={q.label}
                            onChange={(e) => handleUpdateQuestion(qIndex, { label: e.target.value })}
                            placeholder={
                              q.type === "CHECKBOX"
                                ? "e.g. I agree to bring my laptop and materials"
                                : "e.g. What specific topic would you like to cover?"
                            }
                            className="h-8 text-xs mt-1"
                            required
                          />
                        </div>

                        {(q.type === "TEXT" || q.type === "TEXTAREA") && (
                          <div>
                            <Label className="text-xs">Placeholder (optional)</Label>
                            <Input
                              value={q.placeholder || ""}
                              onChange={(e) =>
                                handleUpdateQuestion(qIndex, { placeholder: e.target.value })
                              }
                              placeholder="e.g. Briefly describe..."
                              className="h-8 text-xs mt-1"
                            />
                          </div>
                        )}

                        {q.type === "SELECT" && (
                          <div className="space-y-2.5 pt-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold">Selection Mode</Label>
                              <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-0.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuestion(qIndex, { allowMultiple: false })}
                                  className={`px-2.5 py-1 rounded-md font-medium text-[11px] transition-all cursor-pointer ${
                                    !q.allowMultiple
                                      ? "bg-white text-blue-600 shadow-2xs font-semibold"
                                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                  }`}
                                >
                                  Single choice
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuestion(qIndex, { allowMultiple: true })}
                                  className={`px-2.5 py-1 rounded-md font-medium text-[11px] transition-all cursor-pointer ${
                                    q.allowMultiple
                                      ? "bg-white text-blue-600 shadow-2xs font-semibold"
                                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                  }`}
                                >
                                  Multiple choice
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-0.5">
                              <Label className="text-xs font-semibold">Dropdown Options (min 2)</Label>
                              <button
                                type="button"
                                onClick={() => handleAddOption(qIndex)}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Add Option</span>
                              </button>
                            </div>
                            <div className="space-y-1.5 pl-2 border-l-2 border-[var(--border-subtle)]">
                              {(q.options || []).map((opt, optIndex) => (
                                <div key={opt.id || `opt_${optIndex}`} className="flex items-center gap-2">
                                  <Input
                                    value={opt.label}
                                    onChange={(e) =>
                                      handleUpdateOption(qIndex, optIndex, e.target.value)
                                    }
                                    placeholder={`Option ${optIndex + 1}`}
                                    className="h-7 text-xs flex-1"
                                    required
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOption(qIndex, optIndex)}
                                    disabled={(q.options?.length || 0) <= 2}
                                    className="text-[var(--text-muted)] hover:text-red-600 disabled:opacity-30 disabled:hover:text-[var(--text-muted)] p-1"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Description Field */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Description & Preparation</Label>
              <Textarea
                id="description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly explain what attendees should prepare or expect during this session."
                rows={3}
                className="resize-none"
                aria-invalid={Boolean(fields.description)}
              />
              {fields.description && (
                <p className="text-xs text-[var(--status-danger-text)] font-medium">
                  {fields.description}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] p-3 text-xs text-[var(--status-danger-text)] font-medium">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {eventTypeId ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => void handleDelete()}
                    className="gap-1.5 bg-white border border-red-500 text-red-600 hover:bg-red-600 hover:text-white hover:border-transparent shadow-2xs transition-[background-color,border-color,color] duration-150 ease-out cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </Button>
                </div>
              ) : (
                <div />
              )}

              <div className="flex items-center justify-end gap-2">
                {locationType === "ZOOM" && isZoomConnected === false && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium mr-1 hidden sm:inline">
                    Connect Zoom to continue
                  </span>
                )}
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                >
                  <Link href="/dashboard">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={pending || (locationType === "ZOOM" && isZoomConnected === false)}
                  size="sm"
                  className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pending && <Spinner size="sm" />}
                  <span>{pending ? "Saving…" : eventTypeId ? "Save Changes" : "Create Event Type"}</span>
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
  );
}
