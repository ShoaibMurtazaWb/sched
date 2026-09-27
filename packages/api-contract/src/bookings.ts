import { z } from "zod";
import { type CustomQuestion, CustomQuestionTypeEnum, type PublicLocationMetadata } from "./schemas";

function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, "Phone number must be in valid international format (e.g. +14155552671)");

export const bookingCustomResponseSnapshotSchema = z.object({
  questionId: z.string(),
  label: z.string(),
  type: CustomQuestionTypeEnum,
  value: z.union([z.string(), z.boolean()]),
  selectedOptionLabel: z.string().nullable().optional(),
});

export type BookingCustomResponseSnapshot = z.infer<typeof bookingCustomResponseSnapshotSchema>;

export const createBookingBodySchema = z.object({
  startUtc: z.string().datetime({ message: "startUtc must be a valid ISO 8601 UTC date-time string" }),
  attendeeName: z.string().trim().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  attendeeEmail: z.string().trim().email("Invalid email address"),
  attendeeTimeZone: z
    .string()
    .trim()
    .min(1, "Timezone is required")
    .refine((val) => isValidIanaTimezone(val), {
      message: "attendeeTimeZone must be a valid IANA timezone (e.g. America/New_York)",
    }),
  attendeePhoneNumber: z.string().trim().optional(),
  attendeeNotes: z.string().trim().max(1000, "Notes cannot exceed 1000 characters").optional().default(""),
  customResponses: z.record(z.union([z.string(), z.boolean()])).optional(),
});

export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;

export const cancelBookingBodySchema = z.object({
  expectedSequence: z.number().int().min(0, "expectedSequence must be a non-negative integer"),
  reason: z.string().trim().max(500, "Reason cannot exceed 500 characters").optional(),
});

export type CancelBookingBody = z.infer<typeof cancelBookingBodySchema>;

export const rescheduleBookingBodySchema = z.object({
  startUtc: z.string().datetime({ message: "startUtc must be a valid ISO 8601 UTC date-time string" }),
  expectedSequence: z.number().int().min(0, "expectedSequence must be a non-negative integer"),
  timeZone: z.string().trim().min(1, "Timezone is required").optional(),
  reason: z.string().trim().max(500, "Reason cannot exceed 500 characters").optional(),
});

export type RescheduleBookingBody = z.infer<typeof rescheduleBookingBodySchema>;

export const listBookingsQuerySchema = z.object({
  status: z.enum(["upcoming", "past", "cancelled", "all"]).optional().default("upcoming"),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export const bookingLocationDetailsSchema = z.object({
  type: z.enum([
    "IN_PERSON",
    "HOST_CALLS_ATTENDEE",
    "ATTENDEE_CALLS_HOST",
    "CUSTOM_LINK",
    "STATIC_VIDEO",
    "ZOOM",
  ]),
  data: z.record(z.unknown()),
});

export type BookingLocationDetails = z.infer<typeof bookingLocationDetailsSchema>;

export const bookingSummarySchema = z.object({
  id: z.string().uuid(),
  manageToken: z.string().optional(),
  eventTypeId: z.string().uuid(),
  hostId: z.string().uuid(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.string(),
  sequence: z.number(),
  rescheduleCount: z.number(),
  rescheduledAt: z.string().nullable().optional(),
  rescheduledBy: z.enum(["HOST", "ATTENDEE"]).nullable().optional(),
  rescheduleReason: z.string().nullable().optional(),
  previousStartTime: z.string().nullable().optional(),
  previousEndTime: z.string().nullable().optional(),
  attendeeName: z.string(),
  attendeeEmail: z.string(),
  attendeeTimeZone: z.string(),
  attendeePhoneNumber: z.string().nullable().optional(),
  attendeeNotes: z.string(),
  location: bookingLocationDetailsSchema.nullable().optional(),
  customResponses: z.array(bookingCustomResponseSnapshotSchema).nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
  cancelledBy: z.enum(["HOST", "ATTENDEE"]).nullable().optional(),
  createdAt: z.string(),
  eventType: z.object({
    id: z.string().uuid(),
    title: z.string(),
    slug: z.string(),
    durationMinutes: z.number(),
  }),
  host: z.object({
    id: z.string().uuid(),
    name: z.string(),
    username: z.string(),
    timezone: z.string(),
  }),
});

export type BookingResponse = z.infer<typeof bookingSummarySchema>;

export interface PublicEventTypeDetails {
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

export interface ExistingBookingDetails {
  id: string;
  startTime: string;
  manageUrl: string;
}
