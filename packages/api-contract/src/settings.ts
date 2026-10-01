import { z } from "zod";

export const ProfileSettingsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Please enter a valid email address").optional(),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be at most 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores"),
  timezone: z.string().trim().min(1, "Timezone is required"),
  avatarUrl: z.string().trim().url().or(z.literal("")).nullable().optional(),
});

export type ProfileSettings = z.infer<typeof ProfileSettingsSchema>;

export const NotificationPreferencesSchema = z.object({
  emailReminders: z.boolean().default(true),
  bookingConfirmations: z.boolean().default(true),
  marketingEmails: z.boolean().default(false),
});

export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const SchedulingPreferencesSchema = z.object({
  defaultMeetingDuration: z.number().int().min(5).max(480).default(30),
  defaultBufferMinutes: z.number().int().min(0).max(120).default(0),
  defaultTimezone: z.string().trim().min(1).default("UTC"),
});

export type SchedulingPreferences = z.infer<typeof SchedulingPreferencesSchema>;

export const UserSettingsResponseSchema = z.object({
  profile: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    username: z.string(),
    timezone: z.string(),
    avatarUrl: z.string().nullable().optional(),
    emailVerified: z.boolean().optional(),
    emailVerifiedAt: z.string().nullable().optional(),
    createdAt: z.string(),
  }),
  notificationPreferences: NotificationPreferencesSchema,
  schedulingPreferences: SchedulingPreferencesSchema,
});

export type UserSettingsResponse = z.infer<typeof UserSettingsResponseSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(100),
});

export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  requestId: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
