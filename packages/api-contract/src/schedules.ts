import { z } from "zod";
import { timezoneSchema, usernameSchema } from "./schemas";

export const timeStringSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:mm 24-hour format (e.g. 09:00, 17:30)");

export const dayScheduleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeStringSchema,
    endTime: timeStringSchema,
  })
  .refine((val) => val.startTime < val.endTime, {
    message: "Start time must be strictly before end time",
  });

export const scheduleOverrideSchema = z
  .object({
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    isUnavailable: z.boolean().default(false),
    startTime: timeStringSchema.optional().nullable(),
    endTime: timeStringSchema.optional().nullable(),
  })
  .refine(
    (val) => {
      if (val.isUnavailable) return true;
      if (!val.startTime || !val.endTime) return false;
      return val.startTime < val.endTime;
    },
    { message: "Available overrides must specify a valid startTime and endTime" }
  );

export const updateScheduleBodySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timeZone: timezoneSchema.optional(),
  days: z.array(dayScheduleSchema).optional(),
  overrides: z.array(scheduleOverrideSchema).optional(),
});

export const getPublicSlotsQuerySchema = z.object({
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
  timezone: timezoneSchema.default("UTC"),
});

export const publicHostParamsSchema = z.object({
  username: usernameSchema,
});

export type DaySchedule = z.infer<typeof dayScheduleSchema>;
export type ScheduleOverride = z.infer<typeof scheduleOverrideSchema>;
export type UpdateScheduleBody = z.infer<typeof updateScheduleBodySchema>;
export type GetPublicSlotsQuery = z.infer<typeof getPublicSlotsQuerySchema>;
export type PublicHostParams = z.infer<typeof publicHostParamsSchema>;

export interface ScheduleResponse {
  id: string;
  name: string;
  timeZone: string;
  isDefault: boolean;
  days: DaySchedule[];
  overrides: ScheduleOverride[];
}

export interface TimeSlot {
  time: string; // "09:00 AM" in requested timezone
  startUtc: string; // ISO 8601 UTC
  endUtc: string; // ISO 8601 UTC
  localDate: string; // "YYYY-MM-DD" in requested timezone
}

export interface PublicHostProfileResponse {
  user: {
    name: string;
    username: string;
    timezone: string;
    avatarUrl?: string | null;
  };
  eventTypes: Array<{
    id: string;
    title: string;
    slug: string;
    description: string;
    durationMinutes: number;
    beforeBufferMinutes: number;
    afterBufferMinutes: number;
    locationType?: string | null;
    locationData?: Record<string, unknown> | null;
  }>;
}
