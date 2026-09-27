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
    avatarUrl?: string | null;
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

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `/api/v1${cleanPath}`;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);

  if (init.signal) {
    init.signal.addEventListener("abort", () => controller.abort());
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: "include",
      signal: controller.signal,
    });
  } catch (netErr: unknown) {
    clearTimeout(timeoutId);
    if (netErr instanceof DOMException && netErr.name === "AbortError") {
      throw new ApiError(504, {
        error: {
          code: "TIMEOUT",
          message: "The request is taking too long. Please try again.",
        },
      });
    }
    throw new ApiError(503, {
      error: {
        code: "NETWORK_ERROR",
        message: "Unable to connect to the server. Please check your internet connection and try again.",
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const body = await parseBody(response);
  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(response.status, body);
    }
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, {
      error: {
        code: response.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR",
        message,
      },
    });
  }
  return body as T;
}
