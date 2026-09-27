import { z } from "zod";

export const CalendarProviderTypeEnum = {
  GOOGLE: "GOOGLE",
} as const;
export type CalendarProviderType = (typeof CalendarProviderTypeEnum)[keyof typeof CalendarProviderTypeEnum];

export const CalendarIntegrationStatusEnum = {
  CONNECTED: "CONNECTED",
  REVOKED: "REVOKED",
  DISCONNECTED: "DISCONNECTED",
} as const;
export type CalendarIntegrationStatus =
  (typeof CalendarIntegrationStatusEnum)[keyof typeof CalendarIntegrationStatusEnum];

export const CalendarSyncStatusEnum = {
  PENDING: "PENDING",
  SYNCED: "SYNCED",
  FAILED: "FAILED",
} as const;
export type CalendarSyncStatus = (typeof CalendarSyncStatusEnum)[keyof typeof CalendarSyncStatusEnum];

export interface CalendarItem {
  id: string;
  name: string;
  isPrimary: boolean;
  accessRole: "owner" | "writer" | "writerWithoutPrivateAccess" | "reader" | "freeBusyReader";
  writable: boolean;
}

export interface CalendarIntegrationResponse {
  id: string;
  provider: CalendarProviderType;
  status: CalendarIntegrationStatus;
  accountEmail: string;
  selectedCalendarId: string;
  selectedCalendarName: string | null;
  conflictCalendarIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CalendarListResponse {
  calendars: CalendarItem[];
}

export const updateCalendarPreferencesSchema = z.object({
  selectedCalendarId: z.string().min(1, "Selected calendar is required"),
  conflictCalendarIds: z.array(z.string().min(1)).min(1, "At least one conflict calendar must be selected"),
});
export type UpdateCalendarPreferencesBody = z.infer<typeof updateCalendarPreferencesSchema>;

export const googleConnectQuerySchema = z.object({
  returnUrl: z.string().optional(),
});
export type GoogleConnectQuery = z.infer<typeof googleConnectQuerySchema>;

export const googleCallbackQuerySchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  state: z.string().min(1, "OAuth state is required"),
});
export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>;

export const ZoomIntegrationStatusEnum = {
  CONNECTED: "CONNECTED",
  REVOKED: "REVOKED",
  DISCONNECTED: "DISCONNECTED",
} as const;
export type ZoomIntegrationStatus =
  (typeof ZoomIntegrationStatusEnum)[keyof typeof ZoomIntegrationStatusEnum];

export interface ZoomIntegrationResponse {
  id: string;
  status: ZoomIntegrationStatus;
  accountEmail: string;
  createdAt: string;
  updatedAt: string;
}

export const zoomConnectQuerySchema = z.object({
  returnUrl: z.string().optional(),
});
export type ZoomConnectQuery = z.infer<typeof zoomConnectQuerySchema>;

export const zoomCallbackQuerySchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  state: z.string().min(1, "OAuth state is required"),
});
export type ZoomCallbackQuery = z.infer<typeof zoomCallbackQuerySchema>;

