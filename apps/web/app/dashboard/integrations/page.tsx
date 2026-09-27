"use client";

import { useEffect, useState, useMemo, useTransition, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Trash2,
  Check,
  Clock,
  Mail,
  Calendar as CalendarIcon,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GoogleCalendarLogo } from "@/components/google-calendar-logo";
import { ZoomLogo } from "@/components/zoom-logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
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

  // Handle Return Callback or Status Query Params
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected === "google") {
      setFeedback({
        type: "success",
        message: "Google Calendar connected successfully! Your calendar is now synchronized.",
      });
      startTransition(() => {
        router.replace("/dashboard/integrations");
      });
    } else if (connected === "zoom") {
      setFeedback({
        type: "success",
        message: "Zoom connected successfully! Unique Zoom meeting rooms will now be generated automatically for bookings.",
      });
      startTransition(() => {
        router.replace("/dashboard/integrations");
      });
    } else if (error) {
      setFeedback({
        type: "error",
        message: `Integration error: ${decodeURIComponent(error)}`,
      });
      startTransition(() => {
        router.replace("/dashboard/integrations");
      });
    }

    void loadIntegration();
  }, [searchParams]);

  // Connect / Reconnect Google Calendar
  function handleConnect() {
    setIsConnecting(true);
    setFeedback(null);
    window.location.href = apiUrl("/integrations/google/connect");
  }

  // Connect / Reconnect Zoom
  function handleConnectZoom() {
    setIsZoomConnecting(true);
    setFeedback(null);
    window.location.href = apiUrl("/integrations/zoom/connect");
  }

  // Disconnect Zoom
  async function handleConfirmDisconnectZoom() {
    try {
      setIsZoomDisconnecting(true);
      setFeedback(null);
      await api<ZoomIntegrationResponse>("/integrations/zoom/disconnect", {
        method: "POST",
      });

      setZoomIntegration(null);
      setShowZoomDisconnectModal(false);
      setFeedback({
        type: "success",
        message: "Zoom account has been disconnected.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to disconnect Zoom.",
      });
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
      setFeedback(null);
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
      setFeedback({
        type: "success",
        message: "Calendar preferences saved successfully.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof ApiError ? err.message : "Failed to update calendar preferences.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  // Disconnect Google Calendar
  async function handleConfirmDisconnect() {
    try {
      setIsDisconnecting(true);
      setFeedback(null);
      const res = await api<CalendarIntegrationResponse>("/integrations/google/disconnect", {
        method: "POST",
      });

      setIntegration(res);
      setCalendars([]);
      setShowDisconnectModal(false);
      setFeedback({
        type: "success",
        message: "Google Calendar has been disconnected.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof ApiError ? err.message : "Failed to disconnect Google Calendar.",
      });
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

  // Change Detection
  const hasChanges = useMemo(() => {
    if (!isConnected) return false;
    if (selectedCalendarId !== savedSelectedCalendarId) return true;
    if (conflictCalendarIds.length !== savedConflictCalendarIds.length) return true;
    const currentSet = new Set(conflictCalendarIds);
    return savedConflictCalendarIds.some((id) => !currentSet.has(id));
  }, [isConnected, selectedCalendarId, savedSelectedCalendarId, conflictCalendarIds, savedConflictCalendarIds]);

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Integrations & apps
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Connect your Google Calendar to synchronize busy times, prevent double-bookings, and
          automatically schedule host events.
        </p>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm shadow-xs transition-all ${
            feedback.type === "success"
              ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]"
              : "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100 p-0.5"
            aria-label="Dismiss feedback"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Revoked Notice */}
      {isRevoked && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-900 dark:text-amber-200">
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
              <div className="mt-4">
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isConnecting ? <Spinner size="sm" className="mr-2" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                  Re-connect Google Calendar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-44 rounded-xl border border-[var(--border-subtle)]" />
          <Skeleton className="h-32 rounded-xl border border-[var(--border-subtle)]" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Google Calendar Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
            {/* Header / Identity Row */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isConnected ? "pb-6 border-b border-[var(--border-subtle)]" : ""}`}>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xs">
                  <GoogleCalendarLogo className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">
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
                      <span className="inline-flex items-center rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)] border border-[var(--border-subtle)]">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {isConnected && integration?.accountEmail
                      ? `Connected as ${integration.accountEmail}`
                      : "Sync outbound bookings and query real-time FreeBusy intervals."}
                  </p>
                </div>
              </div>

              <div>
                {!isConnected ? (
                  <Button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="w-full sm:w-auto"
                  >
                    {isConnecting ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Connecting…
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Connect Google Calendar
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setShowDisconnectModal(true)}
                    className="text-[var(--status-danger-text)] hover:bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-xs h-9"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Disconnect
                  </Button>
                )}
              </div>
            </div>

            {/* Rich Connected Status Section */}
            {isConnected && (
              <div className="pt-5 pb-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 p-3.5">
                  <div className="flex items-center gap-2.5 text-xs">
                    <Mail className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <div className="truncate">
                      <div className="text-[var(--text-muted)] font-medium text-[11px]">Account</div>
                      <div className="text-[var(--text-primary)] font-semibold truncate">
                        {integration?.accountEmail || "Primary Account"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-xs">
                    <CalendarIcon className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <div className="truncate">
                      <div className="text-[var(--text-muted)] font-medium text-[11px]">Sync Health</div>
                      <div className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="h-3 w-3" /> Active & Syncing
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-xs">
                    <Clock className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <div className="truncate">
                      <div className="text-[var(--text-muted)] font-medium text-[11px]">Last Updated</div>
                      <div className="text-[var(--text-secondary)] font-medium">
                        {formatLastSyncedTime(integration?.updatedAt)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Calendar Configuration Form */}
                <form onSubmit={handleSavePreferences} className="mt-6 space-y-6">
                  {/* Booking / Destination Calendar */}
                  <div>
                    <label
                      htmlFor="destinationCalendar"
                      className="block text-sm font-semibold text-[var(--text-primary)]"
                    >
                      Booking Calendar
                    </label>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 mb-2.5">
                      New confirmed bookings will be added here.
                    </p>
                    <select
                      id="destinationCalendar"
                      value={selectedCalendarId}
                      onChange={(e) => setSelectedCalendarId(e.target.value)}
                      className="w-full max-w-md rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-2xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    >
                      {calendars.length === 0 ? (
                        <option value="primary">Primary Calendar (Default)</option>
                      ) : (
                        calendars
                          .filter((cal) => cal.writable)
                          .map((cal) => (
                            <option key={cal.id} value={cal.id}>
                              {cal.name} {cal.isPrimary ? "(Primary)" : ""}
                            </option>
                          ))
                      )}
                    </select>
                  </div>

                  {/* Conflict / FreeBusy Calendars */}
                  <div>
                    <label className="block text-sm font-semibold text-[var(--text-primary)]">
                      Check for Conflicts
                    </label>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 mb-3">
                      Select the calendars you want Sched to check for busy times. Slots overlapping
                      with events on these calendars will be marked unavailable.
                    </p>

                    <div className="space-y-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 p-3 max-w-lg">
                      {calendars.length === 0 ? (
                        <div className="flex items-center gap-2 p-2 text-xs text-[var(--text-secondary)]">
                          <Check className="h-4 w-4 text-emerald-600" />
                          <span>Primary Calendar (Checked by default)</span>
                        </div>
                      ) : (
                        calendars.map((cal) => {
                          const isChecked = conflictCalendarIds.includes(cal.id);
                          return (
                            <label
                              key={cal.id}
                              className="flex items-center justify-between gap-3 rounded-lg p-2.5 text-sm transition-colors hover:bg-[var(--bg-surface)] cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleConflictCalendar(cal.id)}
                                  className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] cursor-pointer"
                                />
                                <span className="font-medium text-[var(--text-primary)] text-xs sm:text-sm">
                                  {cal.name} {cal.isPrimary ? "(Primary)" : ""}
                                </span>
                              </div>
                              <span className="text-[11px] font-medium text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)] shrink-0">
                                {formatPermissionLabel(cal.accessRole)}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Save Button with Clean Change Detection */}
                  <div className="pt-2 flex items-center gap-3">
                    <Button
                      type="submit"
                      disabled={!hasChanges || isSaving}
                      className={!hasChanges ? "opacity-60 cursor-not-allowed" : ""}
                    >
                      {isSaving ? (
                        <>
                          <Spinner size="sm" className="mr-2" />
                          Saving changes…
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1.5" />
                          Save Calendar Settings
                        </>
                      )}
                    </Button>
                    {!hasChanges && !isSaving && (
                      <span className="text-xs text-[var(--text-muted)]">No unsaved changes</span>
                    )}
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Zoom Video Conferencing Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
            {/* Header / Identity Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xs">
                  <ZoomLogo className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">
                      Zoom Video Conferencing
                    </h2>
                    {zoomIntegration?.status === "CONNECTED" && (
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
                    {(!zoomIntegration || zoomIntegration.status === "DISCONNECTED") && (
                      <span className="inline-flex items-center rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)] border border-[var(--border-subtle)]">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {zoomIntegration?.status === "CONNECTED" && zoomIntegration?.accountEmail
                      ? `Connected as ${zoomIntegration.accountEmail}. Unique Zoom links will be generated for bookings.`
                      : "Automatically generate dynamic Zoom meeting rooms with secure passcodes upon booking."}
                  </p>
                </div>
              </div>

              <div>
                {zoomIntegration?.status !== "CONNECTED" ? (
                  <Button
                    onClick={handleConnectZoom}
                    disabled={isZoomConnecting}
                    className="w-full sm:w-auto bg-[#2D8CFF] hover:bg-[#1B78EC] text-white"
                  >
                    {isZoomConnecting ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Connecting…
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Connect Zoom
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setShowZoomDisconnectModal(true)}
                    className="text-[var(--status-danger-text)] hover:bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-xs h-9"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Disconnect
                  </Button>
                )}
              </div>
            </div>

            {/* Rich Connected Status Section */}
            {zoomIntegration?.status === "CONNECTED" && (
              <div className="pt-5 mt-5 border-t border-[var(--border-subtle)]">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 p-3.5">
                  <div className="flex items-center gap-2.5 text-xs">
                    <Mail className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <div className="truncate">
                      <div className="text-[var(--text-muted)] font-medium text-[11px]">Zoom Account</div>
                      <div className="text-[var(--text-primary)] font-semibold truncate">
                        {zoomIntegration?.accountEmail || "Primary Account"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-[var(--text-muted)] font-medium text-[11px]">Integration Status</div>
                      <div className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="h-3 w-3" /> Ready for dynamic meetings
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-xs">
                    <Clock className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <div className="truncate">
                      <div className="text-[var(--text-muted)] font-medium text-[11px]">Connected On</div>
                      <div className="text-[var(--text-secondary)] font-medium">
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
