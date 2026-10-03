import { z } from "zod";
import {
  DESCRIPTION_MAX_LENGTH,
  DURATION_MINUTES_MAX,
  DURATION_MINUTES_MIN,
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESERVED_USERNAMES,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
  TITLE_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "./constants";

const reserved = new Set<string>(RESERVED_USERNAMES);

function ianaTimeZones(): Set<string> {
  return new Set(Intl.supportedValuesOf("timeZone"));
}

export const LocationType = {
  IN_PERSON: "IN_PERSON",
  HOST_CALLS_ATTENDEE: "HOST_CALLS_ATTENDEE",
  ATTENDEE_CALLS_HOST: "ATTENDEE_CALLS_HOST",
  CUSTOM_LINK: "CUSTOM_LINK",
  STATIC_VIDEO: "STATIC_VIDEO",
  ZOOM: "ZOOM",
} as const;

export type LocationType = (typeof LocationType)[keyof typeof LocationType];

export const inPersonLocationSchema = z.object({
  address: z
    .string()
    .trim()
    .min(3, "Address must be at least 3 characters")
    .max(300, "Address cannot exceed 300 characters"),
  displayPublicAddress: z.boolean().default(false),
  extraNotes: z.string().trim().max(500, "Extra notes cannot exceed 500 characters").optional(),
});

export const hostCallsAttendeeLocationSchema = z.object({
  extraNotes: z.string().trim().max(500, "Extra notes cannot exceed 500 characters").optional(),
});

export const attendeeCallsHostLocationSchema = z.object({
  hostPhoneNumber: z
    .string()
    .trim()
    .min(7, "Host phone number is too short")
    .max(30, "Host phone number is too long"),
  extraNotes: z.string().trim().max(500, "Extra notes cannot exceed 500 characters").optional(),
});

export const urlLocationSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .max(500, "URL cannot exceed 500 characters")
    .refine((u) => u.startsWith("https://") || u.startsWith("http://"), {
      message: "Meeting URL must start with http:// or https://",
    }),
  extraNotes: z.string().trim().max(500, "Extra notes cannot exceed 500 characters").optional(),
});

export const zoomLocationSchema = z.object({
  extraNotes: z.string().trim().max(500, "Extra notes cannot exceed 500 characters").optional(),
});

export const eventTypeLocationConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("IN_PERSON"), data: inPersonLocationSchema }),
  z.object({
    type: z.literal("HOST_CALLS_ATTENDEE"),
    data: hostCallsAttendeeLocationSchema.default({}),
  }),
  z.object({ type: z.literal("ATTENDEE_CALLS_HOST"), data: attendeeCallsHostLocationSchema }),
  z.object({ type: z.literal("CUSTOM_LINK"), data: urlLocationSchema }),
  z.object({ type: z.literal("STATIC_VIDEO"), data: urlLocationSchema }),
  z.object({ type: z.literal("ZOOM"), data: zoomLocationSchema.default({}) }),
]);

export type EventTypeLocationConfig = z.infer<typeof eventTypeLocationConfigSchema>;

export const publicLocationMetadataSchema = z.object({
  type: z.enum([
    "IN_PERSON",
    "HOST_CALLS_ATTENDEE",
    "ATTENDEE_CALLS_HOST",
    "CUSTOM_LINK",
    "STATIC_VIDEO",
    "ZOOM",
  ]),
  publicAddress: z.string().optional(),
  extraNotes: z.string().optional(),
});

export type PublicLocationMetadata = z.infer<typeof publicLocationMetadataSchema>;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email")
  .max(254)
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(1024);

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(NAME_MAX_LENGTH);

export const usernameSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH)
      .max(USERNAME_MAX_LENGTH)
      .regex(USERNAME_PATTERN, "Use lowercase letters, numbers, and hyphens")
      .refine((value) => !reserved.has(value), "This username is reserved"),
  );

export const slugSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(SLUG_MIN_LENGTH)
      .max(SLUG_MAX_LENGTH)
      .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens"),
  );

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .refine((value) => ianaTimeZones().has(value), "Enter a valid IANA timezone");

export const durationMinutesSchema = z.coerce
  .number()
  .int("Duration must be a whole number of minutes")
  .min(DURATION_MINUTES_MIN)
  .max(DURATION_MINUTES_MAX);

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  username: usernameSchema,
  timezone: timezoneSchema,
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(1024),
});

export const CustomQuestionTypeEnum = z.enum(["TEXT", "TEXTAREA", "SELECT", "CHECKBOX"]);
export type CustomQuestionType = z.infer<typeof CustomQuestionTypeEnum>;

// Inbound schemas (IDs optional for newly created questions/options)
export const inboundSelectOptionSchema = z.object({
  id: z.string().trim().min(1).max(50).optional(),
  label: z.string().trim().min(1, "Option label is required").max(100),
});
export type InboundSelectOption = z.infer<typeof inboundSelectOptionSchema>;

export const inboundTextQuestionSchema = z.object({
  id: z.string().trim().min(1).max(50).optional(),
  type: z.literal("TEXT"),
  label: z.string().trim().min(1, "Question label is required").max(255),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(100).optional(),
});

export const inboundTextareaQuestionSchema = z.object({
  id: z.string().trim().min(1).max(50).optional(),
  type: z.literal("TEXTAREA"),
  label: z.string().trim().min(1, "Question label is required").max(255),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(100).optional(),
});

export const inboundSelectQuestionSchema = z.object({
  id: z.string().trim().min(1).max(50).optional(),
  type: z.literal("SELECT"),
  label: z.string().trim().min(1, "Question label is required").max(255),
  required: z.boolean().default(false),
  allowMultiple: z.boolean().default(false).optional(),
  options: z
    .array(inboundSelectOptionSchema)
    .min(2, "Select questions require at least 2 options")
    .max(25),
});

export const inboundCheckboxQuestionSchema = z.object({
  id: z.string().trim().min(1).max(50).optional(),
  type: z.literal("CHECKBOX"),
  label: z.string().trim().min(1, "Question label is required").max(255),
  required: z.boolean().default(false),
});

export const inboundCustomQuestionSchema = z.discriminatedUnion("type", [
  inboundTextQuestionSchema,
  inboundTextareaQuestionSchema,
  inboundSelectQuestionSchema,
  inboundCheckboxQuestionSchema,
]);
export type InboundCustomQuestion = z.infer<typeof inboundCustomQuestionSchema>;

export const inboundCustomQuestionsListSchema = z
  .array(inboundCustomQuestionSchema)
  .max(20, "Maximum of 20 custom questions allowed");

// Domain / Persisted / Output schemas (IDs strictly mandatory)
export const selectOptionSchema = z.object({
  id: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
});
export type SelectOption = z.infer<typeof selectOptionSchema>;

export const textQuestionSchema = z.object({
  id: z.string().min(1).max(50),
  type: z.literal("TEXT"),
  label: z.string().min(1).max(255),
  required: z.boolean(),
  placeholder: z.string().optional(),
});

export const textareaQuestionSchema = z.object({
  id: z.string().min(1).max(50),
  type: z.literal("TEXTAREA"),
  label: z.string().min(1).max(255),
  required: z.boolean(),
  placeholder: z.string().optional(),
});

export const selectQuestionSchema = z.object({
  id: z.string().min(1).max(50),
  type: z.literal("SELECT"),
  label: z.string().min(1).max(255),
  required: z.boolean(),
  allowMultiple: z.boolean().default(false).optional(),
  options: z.array(selectOptionSchema).min(2).max(25),
});

export const checkboxQuestionSchema = z.object({
  id: z.string().min(1).max(50),
  type: z.literal("CHECKBOX"),
  label: z.string().min(1).max(255),
  required: z.boolean(),
});

export const customQuestionSchema = z.discriminatedUnion("type", [
  textQuestionSchema,
  textareaQuestionSchema,
  selectQuestionSchema,
  checkboxQuestionSchema,
]);
export type CustomQuestion = z.infer<typeof customQuestionSchema>;

export const customQuestionsListSchema = z.array(customQuestionSchema).max(20);

export const createEventTypeBodySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(TITLE_MAX_LENGTH),
  slug: slugSchema,
  description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).default(""),
  durationMinutes: durationMinutesSchema,
  beforeBufferMinutes: z.coerce.number().int().min(0).max(120).default(0),
  afterBufferMinutes: z.coerce.number().int().min(0).max(120).default(0),
  minimumNoticeMinutes: z.coerce.number().int().min(0).max(10080).default(60),
  location: eventTypeLocationConfigSchema,
  customQuestions: inboundCustomQuestionsListSchema.optional(),
});

export const updateEventTypeBodySchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX_LENGTH).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
    durationMinutes: durationMinutesSchema.optional(),
    beforeBufferMinutes: z.coerce.number().int().min(0).max(120).optional(),
    afterBufferMinutes: z.coerce.number().int().min(0).max(120).optional(),
    minimumNoticeMinutes: z.coerce.number().int().min(0).max(10080).optional(),
    location: eventTypeLocationConfigSchema.optional(),
    customQuestions: inboundCustomQuestionsListSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const eventTypeIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listEventTypesQuerySchema = z.object({
  status: z.enum(["active", "archived", "all"]).default("active"),
});

export const publicEventTypeParamsSchema = z.object({
  username: usernameSchema,
  eventSlug: slugSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type CreateEventTypeBody = z.infer<typeof createEventTypeBodySchema>;
export type UpdateEventTypeBody = z.infer<typeof updateEventTypeBodySchema>;
export type ListEventTypesQuery = z.infer<typeof listEventTypesQuerySchema>;
export type PublicEventTypeParams = z.infer<typeof publicEventTypeParamsSchema>;

export const requestPasswordResetBodySchema = z.object({
  email: emailSchema,
});

export const resetPasswordBodySchema = z.object({
  token: z.string().trim().min(1, "Reset token is required"),
  newPassword: passwordSchema,
});

export const requestEmailChangeBodySchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(1, "Current password is required"),
});

export const confirmEmailChangeBodySchema = z.object({
  token: z.string().trim().min(1, "Verification token is required"),
});

export const confirmEmailVerificationBodySchema = z.object({
  token: z.string().trim().min(1, "Verification token is required"),
});

export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type RequestEmailChangeBody = z.infer<typeof requestEmailChangeBodySchema>;
export type ConfirmEmailChangeBody = z.infer<typeof confirmEmailChangeBodySchema>;
export type ConfirmEmailVerificationBody = z.infer<typeof confirmEmailVerificationBodySchema>;

