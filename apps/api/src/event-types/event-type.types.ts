import type { EventType, User } from "@prisma/client";
import type { CustomQuestion, EventTypeLocationConfig, PublicLocationMetadata } from "@sched/api-contract";
import { parseStoredCustomQuestions } from "../shared/utils/custom-questions-parser";
import { parseEventTypeLocation, toPublicLocationMetadata } from "../shared/utils/location-parser";

export type OwnerEventTypeResponse = {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMinutes: number;
  beforeBufferMinutes: number;
  afterBufferMinutes: number;
  minimumNoticeMinutes: number;
  location: EventTypeLocationConfig | null;
  customQuestions: CustomQuestion[];
  archivedAt: string | null;
  bookingCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PublicEventTypeResponse = {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMinutes: number;
  beforeBufferMinutes: number;
  afterBufferMinutes: number;
  minimumNoticeMinutes: number;
  location: PublicLocationMetadata | null;
  customQuestions: CustomQuestion[];
  host: {
    name: string;
    username: string;
    timezone: string;
    avatarUrl: string | null;
  };
};

export function toOwnerEventType(row: EventType & { _count?: { bookings: number } }): OwnerEventTypeResponse {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    durationMinutes: row.durationMinutes,
    beforeBufferMinutes: row.beforeBufferMinutes,
    afterBufferMinutes: row.afterBufferMinutes,
    minimumNoticeMinutes: row.minimumNoticeMinutes,
    location: parseEventTypeLocation(row.locationType, row.locationData),
    customQuestions: parseStoredCustomQuestions(row.customQuestions),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    bookingCount: row._count?.bookings ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPublicEventType(row: EventType, host: User): PublicEventTypeResponse {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    durationMinutes: row.durationMinutes,
    beforeBufferMinutes: row.beforeBufferMinutes,
    afterBufferMinutes: row.afterBufferMinutes,
    minimumNoticeMinutes: row.minimumNoticeMinutes,
    location: toPublicLocationMetadata(row.locationType, row.locationData),
    customQuestions: parseStoredCustomQuestions(row.customQuestions),
    host: {
      name: host.name,
      username: host.username,
      timezone: host.timezone,
      avatarUrl: host.avatarUrl ?? null,
    },
  };
}
