"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Globe,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { TimezonePicker } from "@/components/timezone-picker";
import { api } from "@/lib/api";
import type { ScheduleResponse, DaySchedule, ScheduleOverride } from "@sched/api-contract";

const DAYS_OF_WEEK = [
  { day: 1, name: "Monday", short: "Mon" },
  { day: 2, name: "Tuesday", short: "Tue" },
  { day: 3, name: "Wednesday", short: "Wed" },
  { day: 4, name: "Thursday", short: "Thu" },
  { day: 5, name: "Friday", short: "Fri" },
  { day: 6, name: "Saturday", short: "Sat" },
  { day: 0, name: "Sunday", short: "Sun" },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  const hourStr = String(hours).padStart(2, "0");
  const value = `${hourStr}:${minutes}`;

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const label = `${displayHour}:${minutes} ${period}`;

  return { value, label };
});

interface LocalDaySchedule extends DaySchedule {
  id: string;
}

interface InitialState {
  name: string;
  timeZone: string;
  days: LocalDaySchedule[];
  overrides: ScheduleOverride[];
}

function cleanDays(list: LocalDaySchedule[]): DaySchedule[] {
  return list.map(({ dayOfWeek, startTime, endTime }) => ({
    dayOfWeek,
    startTime,
    endTime,
  }));
}

export function AvailabilityEditor() {
  const [initialState, setInitialState] = useState<InitialState | null>(null);
  const [timeZone, setTimeZone] = useState<string>("UTC");
  const [name, setName] = useState<string>("Working Hours");
  const [days, setDays] = useState<LocalDaySchedule[]>([]);
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);


  useEffect(() => {
    async function fetchSchedule() {
      setIsLoading(true);
      try {
        const data = await api<ScheduleResponse>("/schedules/default");
        const loadedDays: LocalDaySchedule[] = data.days.map((d) => ({
          ...d,
          id: crypto.randomUUID(),
        }));
        setName(data.name);
        setTimeZone(data.timeZone);
        setDays(loadedDays);
        setOverrides(data.overrides);
        setInitialState({
          name: data.name,
          timeZone: data.timeZone,
          days: loadedDays,
          overrides: data.overrides,
        });
      } catch {
        toast.error("Failed to load schedule", "Please check your network connection.");
      } finally {
        setIsLoading(false);
      }
    }
    void fetchSchedule();
  }, []);

  // Compute form dirty state
  const isDirty = useMemo(() => {
    if (!initialState) return false;
    return (
      name !== initialState.name ||
      timeZone !== initialState.timeZone ||
      JSON.stringify(cleanDays(days)) !== JSON.stringify(cleanDays(initialState.days))
    );
  }, [name, timeZone, days, initialState]);

  const handleDiscard = () => {
    if (!initialState) return;
    setName(initialState.name);
    setTimeZone(initialState.timeZone);
    setDays(initialState.days);
    setOverrides(initialState.overrides);
    toast.info("Changes discarded", "Reset to original schedule.");
  };

  const isDayEnabled = (dayOfWeek: number) => {
    return days.some((d) => d.dayOfWeek === dayOfWeek);
  };

  const getDayIntervals = (dayOfWeek: number) => {
    return days.filter((d) => d.dayOfWeek === dayOfWeek);
  };

  const toggleDay = (dayOfWeek: number) => {
    if (isDayEnabled(dayOfWeek)) {
      setDays((prev) => prev.filter((d) => d.dayOfWeek !== dayOfWeek));
    } else {
      setDays((prev) => [
        ...prev,
        { id: crypto.randomUUID(), dayOfWeek, startTime: "09:00", endTime: "17:00" },
      ]);
    }
  };

  const addInterval = (dayOfWeek: number) => {
    const currentIntervals = days.filter((d) => d.dayOfWeek === dayOfWeek);
    const lastInterval = currentIntervals[currentIntervals.length - 1];
    let defaultStart = "13:00";
    let defaultEnd = "17:00";

    if (lastInterval && lastInterval.endTime < "23:00") {
      defaultStart = lastInterval.endTime <= "13:00" ? "13:00" : lastInterval.endTime;
      defaultEnd = "17:00" > defaultStart ? "17:00" : "22:00";
    }

    setDays((prev) => [
      ...prev,
      { id: crypto.randomUUID(), dayOfWeek, startTime: defaultStart, endTime: defaultEnd },
    ]);
  };

  const removeInterval = (id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id));
  };

  const updateIntervalTime = (
    id: string,
    field: "startTime" | "endTime",
    val: string
  ) => {
    setDays((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: val } : d))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payloadDays = cleanDays(days);
      const updated = await api<ScheduleResponse>("/schedules/default", {
        method: "PUT",
        body: JSON.stringify({
          name,
          timeZone,
          days: payloadDays,
          overrides,
        }),
      });
      const loadedDays: LocalDaySchedule[] = updated.days.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
      }));
      setName(updated.name);
      setTimeZone(updated.timeZone);
      setDays(loadedDays);
      setOverrides(updated.overrides);
      setInitialState({
        name: updated.name,
        timeZone: updated.timeZone,
        days: loadedDays,
        overrides: updated.overrides,
      });
      toast.success("Schedule saved", "Your weekly availability has been updated.");
    } catch {
      toast.error("Could not save schedule", "Ensure all start times precede end times.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full min-h-0 overflow-y-auto px-4 sm:px-6 md:px-10 lg:px-14 py-4 sm:py-6 md:py-8 w-full space-y-6 pb-16">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-40 rounded-xl border border-[var(--border-subtle)]" />
        <Skeleton className="h-96 rounded-xl border border-[var(--border-subtle)]" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 sm:px-6 md:px-10 lg:px-14 py-4 sm:py-6 md:py-8 w-full space-y-8 pb-24">
      {/* Header Title Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Availability</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Configure your default working hours and recurring weekly schedules.
          </p>
        </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            size="sm"
            className="self-start sm:self-auto gap-2"
          >
            {isSaving ? <Spinner size="sm" /> : <Check className="h-4 w-4" />}
            <span>{isSaving ? "Saving…" : "Save Changes"}</span>
          </Button>
        </div>

        {/* General Schedule Settings */}
        <Card className="p-6 bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Globe className="h-4 w-4 text-[var(--text-secondary)]" />
            <span>Timezone Settings</span>
          </div>

          <div className="space-y-1.5 max-w-md">
            <Label htmlFor="schedule-timezone">Host Timezone</Label>
            <TimezonePicker
              id="schedule-timezone"
              value={timeZone}
              onChange={setTimeZone}
            />
          </div>
        </Card>

        {/* Weekly Recurring Availability Editor */}
        <Card className="p-6 bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Weekly Hours</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Define the hours when you are available for bookings every week.
            </p>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {DAYS_OF_WEEK.map(({ day, name: dayName }) => {
              const enabled = isDayEnabled(day);
              const intervals = getDayIntervals(day);

              return (
                <div key={day} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                  {/* Day Toggle */}
                  <div className="flex h-8 items-center gap-3 w-32 shrink-0">
                    <input
                      type="checkbox"
                      id={`day-${day}`}
                      checked={enabled}
                      onChange={() => toggleDay(day)}
                      className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label
                      htmlFor={`day-${day}`}
                      className={`text-sm font-medium cursor-pointer select-none leading-none ${
                        enabled ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {dayName}
                    </label>
                  </div>

                  {/* Intervals list or Unavailable label */}
                  <div className="flex-1 space-y-2">
                    {!enabled ? (
                      <div className="flex h-8 items-center">
                        <span className="text-xs font-medium text-[var(--text-disabled)]">
                          Unavailable
                        </span>
                      </div>
                    ) : (
                      intervals.map((interval, idx) => (
                        <div key={interval.id} className="flex flex-wrap items-center gap-2">
                          <div className="w-28">
                            <Select
                              size="sm"
                              value={interval.startTime}
                              onChange={(e) => updateIntervalTime(interval.id, "startTime", e.target.value)}
                              className="tabular-nums font-sans"
                            >
                              {TIME_OPTIONS.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </Select>
                          </div>

                          <span className="text-xs text-[var(--text-muted)] select-none px-0.5">—</span>

                          <div className="w-28">
                            <Select
                              size="sm"
                              value={interval.endTime}
                              onChange={(e) => updateIntervalTime(interval.id, "endTime", e.target.value)}
                              className="tabular-nums font-sans"
                            >
                              {TIME_OPTIONS.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </Select>
                          </div>

                          {intervals.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeInterval(interval.id)}
                              className="text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-50"
                              title="Remove interval"
                              aria-label="Remove interval"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {idx === intervals.length - 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addInterval(day)}
                              className="border-dashed gap-1 text-xs"
                              title="Add split shift interval"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Add interval</span>
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Minimal Floating Dirty-State Unsaved Changes Bar */}
        {isDirty && (
          <div className="fixed bottom-6 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 max-w-xl w-full z-[60] bg-neutral-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5 fade-in-0 duration-200 border border-neutral-800">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="text-xs font-medium text-neutral-200">
                You have unsaved changes
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDiscard}
                disabled={isSaving}
                className="text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs h-8"
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-white text-neutral-900 hover:bg-neutral-100 text-xs h-8 gap-1.5 font-semibold"
              >
                {isSaving ? <Spinner size="sm" /> : <Check className="h-3.5 w-3.5 text-neutral-900" />}
                <span>{isSaving ? "Saving…" : "Save Changes"}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
  );
}
