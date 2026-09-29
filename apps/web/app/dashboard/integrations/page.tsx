"use client";

import { useEffect, useState, useMemo, useTransition, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Trash2,
  Check,
  Clock,
  Mail,
  Calendar as CalendarIcon,
  ChevronDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GoogleCalendarLogo } from "@/components/google-calendar-logo";
import { ZoomLogo } from "@/components/zoom-logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CustomSelect } from "@/components/ui/custom-select";
import { toast } from "@/components/ui/toast";
import { api, apiUrl } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import type {
  CalendarIntegrationResponse,
  CalendarListResponse,
  CalendarItem,
  ZoomIntegrationResponse,
} from "@sched/api-contract";

function formatPermissionLabel(accessRole: CalendarItem["accessRole"]): string {
  switch (accessRole) {
    case "owner":
      return "Owner access";
    case "writer":
      return "Can edit events";
    case "writerWithoutPrivateAccess":
      return "Can edit events (limited)";
    case "reader":
      return "Read-only access";
    case "freeBusyReader":
      return "Free/busy access only";
    default:
      return accessRole;
  }
}

function formatLastSyncedTime(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return dateStr;
  }
}

function IntegrationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [integration, setIntegration] = useState<CalendarIntegrationResponse | null>(null);
  const [zoomIntegration, setZoomIntegration] = useState<ZoomIntegrationResponse | null>(null);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);

  // Form State
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("primary");
  const [conflictCalendarIds, setConflictCalendarIds] = useState<string[]>(["primary"]);

  // Committed/Saved State for change detection
  const [savedSelectedCalendarId, setSavedSelectedCalendarId] = useState<string>("primary");
  const [savedConflictCalendarIds, setSavedConflictCalendarIds] = useState<string[]>(["primary"]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Zoom Integration State
  const [isZoomConnecting, setIsZoomConnecting] = useState(false);
  const [isZoomDisconnecting, setIsZoomDisconnecting] = useState(false);
  const [showZoomDisconnectModal, setShowZoomDisconnectModal] = useState(false);
  // Collapsible Card States (default collapsed for compact summary view)
  const [isGoogleExpanded, setIsGoogleExpanded] = useState(false);
  const [isZoomExpanded, setIsZoomExpanded] = useState(false);

  const [, startTransition] = useTransition();

  // Load Integration Data
  async function loadIntegration() {
    try {
      setIsLoading(true);
      const [googleData, zoomData] = await Promise.all([
        api<CalendarIntegrationResponse | null>("/integrations/google").catch(() => null),
        api<ZoomIntegrationResponse | null>("/integrations/zoom").catch(() => null),
      ]);

      setIntegration(googleData);
      setZoomIntegration(zoomData);

      if (googleData && googleData.status === "CONNECTED") {
        let initialSelectedId = googleData.selectedCalendarId || "primary";
        let initialConflictIds =
          googleData.conflictCalendarIds && googleData.conflictCalendarIds.length > 0
            ? googleData.conflictCalendarIds
            : ["primary"];

        try {
          const calList = await api<CalendarListResponse>("/integrations/google/calendars");
          setCalendars(calList.calendars);

          const primaryCal = calList.calendars.find((c) => c.isPrimary);
          if (primaryCal) {
            if (initialSelectedId === "primary") {
              initialSelectedId = primaryCal.id;
            }
            initialConflictIds = initialConflictIds.map((id) =>
              id === "primary" ? primaryCal.id : id
            );
          }
        } catch (calErr) {
          console.error("Failed to load calendars", calErr);
        }

        setSelectedCalendarId(initialSelectedId);
        setConflictCalendarIds(initialConflictIds);
        setSavedSelectedCalendarId(initialSelectedId);
        setSavedConflictCalendarIds(initialConflictIds);
      }
    } catch (err) {
      console.error("Failed to load integrations", err);
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Return Callback or Status Query Params with Global Toasts
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected === "google") {
      toast.success(
        "Google Calendar connected",
        "Your calendar is now synchronized with Sched."
      );
      startTransition(() => {
        router.replace("/dashboard/integrations");
      });
    } else if (connected === "zoom") {
      toast.success(
        "Zoom connected",
        "Unique Zoom meeting rooms will now be generated automatically for bookings."
      );
      startTransition(() => {
        router.replace("/dashboard/integrations");
      });
    } else if (error) {
      toast.error(
        "Integration error",
        decodeURIComponent(error)
      );
      startTransition(() => {
        router.replace("/dashboard/integrations");
      });
    }

    void loadIntegration();
  }, [searchParams]);

  // Connect / Reconnect Google Calendar
  function handleConnect() {
    setIsConnecting(true);
    window.location.href = apiUrl("/integrations/google/connect");
  }

  // Connect / Reconnect Zoom
  function handleConnectZoom() {
    setIsZoomConnecting(true);
    window.location.href = apiUrl("/integrations/zoom/connect");
  }

  // Disconnect Zoom
  async function handleConfirmDisconnectZoom() {
    try {
      setIsZoomDisconnecting(true);
      await api<ZoomIntegrationResponse>("/integrations/zoom/disconnect", {
        method: "POST",
      });

      setZoomIntegration(null);
      setShowZoomDisconnectModal(false);
      setIsZoomExpanded(false);
      toast.success("Zoom account disconnected", "Your Zoom integration has been removed.");
    } catch (err) {
      toast.error(
        "Failed to disconnect Zoom",
        err instanceof ApiError ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsZoomDisconnecting(false);
    }
  }

  // Save Calendar Preferences
  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    if (!integration) return;

    try {
      setIsSaving(true);
      const updated = await api<CalendarIntegrationResponse>("/integrations/google/calendars", {
        method: "PATCH",
        body: JSON.stringify({
          selectedCalendarId,
          conflictCalendarIds,
        }),
      });

      setIntegration(updated);
      setSavedSelectedCalendarId(selectedCalendarId);
      setSavedConflictCalendarIds(conflictCalendarIds);
      toast.success("Calendar preferences saved", "Your booking and conflict calendars have been updated.");
    } catch (err) {
      toast.error(
        "Failed to update preferences",
        err instanceof ApiError ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Disconnect Google Calendar
  async function handleConfirmDisconnect() {
    try {
      setIsDisconnecting(true);
      const res = await api<CalendarIntegrationResponse>("/integrations/google/disconnect", {
        method: "POST",
      });

      setIntegration(res);
      setCalendars([]);
      setShowDisconnectModal(false);
      setIsGoogleExpanded(false);
      toast.success("Google Calendar disconnected", "Google Calendar integration has been removed.");
    } catch (err) {
      toast.error(
        "Failed to disconnect",
        err instanceof ApiError ? err.message : "Failed to disconnect Google Calendar."
      );
    } finally {
      setIsDisconnecting(false);
    }
  }

  function toggleConflictCalendar(id: string) {
    setConflictCalendarIds((prev) =>
      prev.includes(id) ? prev.filter((calId) => calId !== id) : [...prev, id]
    );
  }

  const isConnected = integration?.status === "CONNECTED";
  const isRevoked = integration?.status === "REVOKED";
  const isZoomConnected = zoomIntegration?.status === "CONNECTED";

  const calendarSelectOptions = useMemo(() => {
    if (calendars.length === 0) {
      return [{ value: "primary", label: "Primary Calendar (Default)" }];
    }
    return calendars
      .filter((cal) => cal.writable)
      .map((cal) => ({
        value: cal.id,
        label: `${cal.name}${cal.isPrimary ? " (Primary)" : ""}`,
        sublabel: cal.isPrimary ? "Default writable calendar" : undefined,
      }));
  }, [calendars]);

  // Change Detection
  const hasChanges = useMemo(() => {
    if (!isConnected) return false;
    if (selectedCalendarId !== savedSelectedCalendarId) return true;
    if (conflictCalendarIds.length !== savedConflictCalendarIds.length) return true;
    const currentSet = new Set(conflictCalendarIds);
    return savedConflictCalendarIds.some((id) => !currentSet.has(id));
  }, [isConnected, selectedCalendarId, savedSelectedCalendarId, conflictCalendarIds, savedConflictCalendarIds]);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-2 sm:px-3 lg:px-4 pb-4 sm:pb-6 pt-0 w-full space-y-6">
      {/* Subtle Gray Surface Container with Rounded Corners */}
      <div className="bg-surface-subtle rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 space-y-6 shadow-xs">
        {/* Page Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-main">
            Integrations & apps
          </h1>
          <p className="mt-1 text-xs text-text-sub">
            Connect your Google Calendar and Zoom to synchronize busy times, prevent double-bookings, and automatically schedule meetings.
          </p>
        </div>

        {/* Revoked Notice */}
        {isRevoked && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-3.5">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  Google Calendar Access Revoked or Expired
                </p>
                <p className="mt-1 text-xs opacity-90 leading-relaxed text-amber-900 dark:text-amber-200">
                  Sched can no longer verify availability or synchronize events with your Google account (
                  <span className="font-mono font-medium">{integration?.accountEmail}</span>). Please re-authorize
                  to restore live calendar synchronization.
                </p>
                <div className="mt-3.5">
                  <Button
                    size="sm"
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="rounded-full bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-4 h-9 shadow-xs"
                  >
                    {isConnecting ? <Spinner size="sm" className="mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Re-connect Google Calendar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. Google Calendar Card (Collapsible Summary-First) */}
            <div className="rounded-2xl border border-border-subtle bg-surface shadow-xs transition-all duration-200 overflow-hidden">
              {/* Summary Row (Always Visible) */}
              <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle shadow-2xs">
                    <GoogleCalendarLogo className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-text-main">
                        Google Calendar
                      </h2>
                      {isConnected && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Connected
                        </span>
                      )}
                      {isRevoked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="h-3 w-3" /> Re-auth Required
                        </span>
                      )}
                      {!isConnected && !isRevoked && (
                        <span className="inline-flex items-center rounded-full bg-surface-subtle px-2.5 py-0.5 text-xs font-medium text-text-muted">
                          Not Connected
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-text-sub">
                      {isConnected && integration?.accountEmail
                        ? `Connected as ${integration.accountEmail}`
                        : "Sync outbound bookings and query real-time FreeBusy intervals."}
                    </p>
                  </div>
                </div>

                {/* Main Actions + Expand/Collapse Trigger */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap">
                  {!isConnected ? (
                    <Button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold px-4 h-9 shadow-xs"
                    >
                      {isConnecting ? (
                        <>
                          <Spinner size="sm" className="mr-2" />
                          Connecting…
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Connect Google Calendar
                        </>
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDisconnectModal(true)}
                        className="rounded-full text-text-muted hover:text-rose-600 hover:bg-rose-500/10 text-xs font-semibold h-9 px-3.5"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Disconnect
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsGoogleExpanded((prev) => !prev)}
                        className="rounded-full border-border-subtle bg-surface hover:bg-blue-50/70 hover:text-brand text-text-main text-xs font-semibold h-9 px-3.5 gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>Details</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${
                            isGoogleExpanded ? "rotate-180 text-brand" : "text-text-muted"
                          }`}
                        />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Collapsible Details Section with Smooth Transition */}
              {isConnected && isGoogleExpanded && (
                <div className="border-t border-border-subtle bg-surface-subtle/30 p-5 sm:p-6 space-y-6 animate-in fade-in-0 duration-200">
                  {/* Metadata Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border-subtle bg-surface p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2.5 text-xs">
                      <Mail className="h-4 w-4 text-text-muted shrink-0" />
                      <div className="truncate">
                        <div className="text-text-muted font-medium text-[11px]">Account</div>
                        <div className="text-text-main font-semibold truncate">
                          {integration?.accountEmail || "Primary Account"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 text-xs">
                      <CalendarIcon className="h-4 w-4 text-text-muted shrink-0" />
                      <div className="truncate">
                        <div className="text-text-muted font-medium text-[11px]">Sync Health</div>
                        <div className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <Check className="h-3 w-3" /> Active & Syncing
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 text-xs">
                      <Clock className="h-4 w-4 text-text-muted shrink-0" />
                      <div className="truncate">
                        <div className="text-text-muted font-medium text-[11px]">Last Updated</div>
                        <div className="text-text-sub font-medium">
                          {formatLastSyncedTime(integration?.updatedAt)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Calendar Preferences Form */}
                  <form onSubmit={handleSavePreferences} className="space-y-5">
                    {/* Booking / Destination Calendar */}
                    <div>
                      <label
                        htmlFor="destinationCalendar"
                        className="block text-xs font-bold text-text-main"
                      >
                        Booking Calendar
                      </label>
                      <p className="text-xs text-text-sub mt-0.5 mb-2">
                        New confirmed bookings will be automatically written to this calendar.
                      </p>
                      <div className="max-w-md">
                        <CustomSelect
                          id="destinationCalendar"
                          value={selectedCalendarId}
                          onChange={(val) => setSelectedCalendarId(val)}
                          options={calendarSelectOptions}
                        />
                      </div>
                    </div>

                    {/* Conflict / FreeBusy Calendars */}
                    <div>
                      <label className="block text-xs font-bold text-text-main">
                        Check for Conflicts
                      </label>
                      <p className="text-xs text-text-sub mt-0.5 mb-2.5">
                        Select the calendars you want Sched to check for busy times. Slots overlapping
                        with events on these calendars will be marked unavailable.
                      </p>

                      <div className="space-y-1 rounded-xl border border-border-subtle bg-surface p-2.5 max-w-lg shadow-2xs">
                        {calendars.length === 0 ? (
                          <div className="flex items-center gap-2 p-2 text-xs text-text-sub">
                            <Check className="h-4 w-4 text-emerald-600" />
                            <span>Primary Calendar (Checked by default)</span>
                          </div>
                        ) : (
                          calendars.map((cal) => {
                            const isChecked = conflictCalendarIds.includes(cal.id);
                            return (
                              <label
                                key={cal.id}
                                className="flex items-center justify-between gap-3 rounded-lg p-2 text-xs transition-colors hover:bg-surface-subtle cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleConflictCalendar(cal.id)}
                                    className="h-4 w-4 rounded border-border-strong text-brand focus:ring-brand cursor-pointer"
                                  />
                                  <span className="font-semibold text-text-main">
                                    {cal.name} {cal.isPrimary ? "(Primary)" : ""}
                                  </span>
                                </div>
                                <span className="text-[11px] font-medium text-text-muted bg-surface-subtle px-2 py-0.5 rounded-md border border-border-subtle shrink-0">
                                  {formatPermissionLabel(cal.accessRole)}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="pt-2 flex items-center gap-3">
                      <Button
                        type="submit"
                        disabled={!hasChanges || isSaving}
                        className={`rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold px-5 h-9 shadow-xs cursor-pointer ${
                          !hasChanges ? "opacity-60 cursor-not-allowed" : ""
                        }`}
                      >
                        {isSaving ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Saving changes…
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1.5" />
                            Save Calendar Settings
                          </>
                        )}
                      </Button>
                      {!hasChanges && !isSaving && (
                        <span className="text-xs text-text-muted font-medium">No unsaved changes</span>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* 2. Zoom Video Conferencing Card (Collapsible Summary-First) */}
            <div className="rounded-2xl border border-border-subtle bg-surface shadow-xs transition-all duration-200 overflow-hidden">
              {/* Summary Row (Always Visible) */}
              <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle shadow-2xs">
                    <ZoomLogo className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-text-main">
                        Zoom Video Conferencing
                      </h2>
                      {isZoomConnected && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Connected
                        </span>
                      )}
                      {zoomIntegration?.status === "REVOKED" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="h-3 w-3" /> Re-auth Required
                        </span>
                      )}
                      {!isZoomConnected && (
                        <span className="inline-flex items-center rounded-full bg-surface-subtle px-2.5 py-0.5 text-xs font-medium text-text-muted">
                          Not Connected
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-text-sub">
                      {isZoomConnected && zoomIntegration?.accountEmail
                        ? `Connected as ${zoomIntegration.accountEmail}`
                        : "Automatically generate dynamic Zoom meeting rooms with secure passcodes."}
                    </p>
                  </div>
                </div>

                {/* Actions + Expand Trigger */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap">
                  {!isZoomConnected ? (
                    <Button
                      onClick={handleConnectZoom}
                      disabled={isZoomConnecting}
                      className="rounded-full bg-[#2D8CFF] hover:bg-[#1B78EC] text-white text-xs font-semibold px-4 h-9 shadow-xs"
                    >
                      {isZoomConnecting ? (
                        <>
                          <Spinner size="sm" className="mr-2" />
                          Connecting…
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Connect Zoom
                        </>
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowZoomDisconnectModal(true)}
                        className="rounded-full text-text-muted hover:text-rose-600 hover:bg-rose-500/10 text-xs font-semibold h-9 px-3.5"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Disconnect
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsZoomExpanded((prev) => !prev)}
                        className="rounded-full border-border-subtle bg-surface hover:bg-blue-50/70 hover:text-brand text-text-main text-xs font-semibold h-9 px-3.5 gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>Details</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${
                            isZoomExpanded ? "rotate-180 text-brand" : "text-text-muted"
                          }`}
                        />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Collapsible Details Section */}
              {isZoomConnected && isZoomExpanded && (
                <div className="border-t border-border-subtle bg-surface-subtle/30 p-5 sm:p-6 animate-in fade-in-0 duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border-subtle bg-surface p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2.5 text-xs">
                      <Mail className="h-4 w-4 text-text-muted shrink-0" />
                      <div className="truncate">
                        <div className="text-text-muted font-medium text-[11px]">Zoom Account</div>
                        <div className="text-text-main font-semibold truncate">
                          {zoomIntegration?.accountEmail || "Primary Account"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="truncate">
                        <div className="text-text-muted font-medium text-[11px]">Integration Status</div>
                        <div className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <Check className="h-3 w-3" /> Ready for dynamic meetings
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 text-xs">
                      <Clock className="h-4 w-4 text-text-muted shrink-0" />
                      <div className="truncate">
                        <div className="text-text-muted font-medium text-[11px]">Connected On</div>
                        <div className="text-text-sub font-medium">
                          {formatLastSyncedTime(zoomIntegration?.updatedAt || zoomIntegration?.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Disconnect Google Calendar Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] mb-4">
              <Trash2 className="h-5 w-5" />
            </div>

            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Disconnect Google Calendar?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Disconnecting Google Calendar stops availability checking and event synchronization. Existing bookings are not deleted.
            </p>

            <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnecting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmDisconnect}
                disabled={isDisconnecting}
                className="w-full sm:w-auto bg-[var(--status-danger-text)] hover:opacity-90 text-white"
              >
                {isDisconnecting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Disconnecting…
                  </>
                ) : (
                  "Disconnect Calendar"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Zoom Modal */}
      {showZoomDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger-text)] mb-4">
              <Trash2 className="h-5 w-5" />
            </div>

            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Disconnect Zoom Account?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Disconnecting Zoom will stop automated creation of unique Zoom meeting rooms for new bookings. Existing scheduled Zoom meetings will remain active on your Zoom account.
            </p>

            <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowZoomDisconnectModal(false)}
                disabled={isZoomDisconnecting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmDisconnectZoom}
                disabled={isZoomDisconnecting}
                className="w-full sm:w-auto bg-[var(--status-danger-text)] hover:opacity-90 text-white"
              >
                {isZoomDisconnecting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Disconnecting…
                  </>
                ) : (
                  "Disconnect Zoom"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl py-6 px-4 sm:px-6 space-y-6">
          <Skeleton className="h-44 rounded-xl border border-[var(--border-subtle)]" />
          <Skeleton className="h-32 rounded-xl border border-[var(--border-subtle)]" />
        </div>
      }
    >
      <IntegrationsContent />
    </Suspense>
  );
}
