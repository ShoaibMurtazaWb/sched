import { ApiError, isApiErrorBody } from "./api-error";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  username: string;
  timezone: string;
  avatarUrl?: string | null;
  createdAt: string;
};

import type {
  CustomQuestion,
  EventTypeLocationConfig,
  PublicLocationMetadata,
  UserSettingsResponse,
  ProfileSettings,
  NotificationPreferences,
  SchedulingPreferences,
  AuditLogEntry,
} from "@sched/api-contract";

export type {
  UserSettingsResponse,
  ProfileSettings,
  NotificationPreferences,
  SchedulingPreferences,
  AuditLogEntry,
};

export type EventType = {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMinutes: number;
  location?: EventTypeLocationConfig | null;
  customQuestions?: CustomQuestion[];
  archivedAt: string | null;
  bookingCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type PublicEventType = {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMinutes: number;
  location?: PublicLocationMetadata | null;
  customQuestions?: CustomQuestion[];
  host: {
    name: string;
    username: string;
    timezone: string;
  };
};

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

export const API_BASE_URL = (
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "")
    : ""
);

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}/api/v1${cleanPath}`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (netErr) {
    throw new ApiError(503, {
      error: {
        code: "NETWORK_ERROR",
        message:
          netErr instanceof Error
            ? netErr.message
            : "Network error: Unable to reach the scheduling API server.",
      },
    });
  }

  const body = await parseBody(response);
  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(response.status, body);
    }
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, {
      error: {
        code: response.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR",
        message,
      },
    });
  }
  return body as T;
}
