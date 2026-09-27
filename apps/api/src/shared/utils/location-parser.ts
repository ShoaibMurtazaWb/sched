import { LocationType } from "@prisma/client";
import type {
  BookingLocationDetails,
  EventTypeLocationConfig,
  PublicLocationMetadata,
} from "@sched/api-contract";
import {
  attendeeCallsHostLocationSchema,
  hostCallsAttendeeLocationSchema,
  inPersonLocationSchema,
  urlLocationSchema,
  zoomLocationSchema,
} from "@sched/api-contract";

export function parseEventTypeLocation(
  type: LocationType | string | null | undefined,
  data: unknown
): EventTypeLocationConfig | null {
  if (!type) return null;

  switch (type) {
    case LocationType.IN_PERSON: {
      const parsed = inPersonLocationSchema.parse(data);
      return { type: "IN_PERSON", data: parsed };
    }
    case LocationType.HOST_CALLS_ATTENDEE: {
      const parsed = hostCallsAttendeeLocationSchema.parse(data || {});
      return { type: "HOST_CALLS_ATTENDEE", data: parsed };
    }
    case LocationType.ATTENDEE_CALLS_HOST: {
      const parsed = attendeeCallsHostLocationSchema.parse(data);
      return { type: "ATTENDEE_CALLS_HOST", data: parsed };
    }
    case LocationType.CUSTOM_LINK: {
      const parsed = urlLocationSchema.parse(data);
      return { type: "CUSTOM_LINK", data: parsed };
    }
    case LocationType.STATIC_VIDEO: {
      const parsed = urlLocationSchema.parse(data);
      return { type: "STATIC_VIDEO", data: parsed };
    }
    case LocationType.ZOOM: {
      const parsed = zoomLocationSchema.parse(data || {});
      return { type: "ZOOM", data: parsed };
    }
    default:
      return null;
  }
}

export function parseBookingLocation(
  type: LocationType | string | null | undefined,
  data: unknown
): BookingLocationDetails | null {
  if (!type) return null;

  if (type === LocationType.ZOOM && data && typeof data === "object") {
    return {
      type: "ZOOM",
      data: data as Record<string, unknown>,
    };
  }

  const eventTypeLoc = parseEventTypeLocation(type, data);
  if (!eventTypeLoc) return null;

  return {
    type: eventTypeLoc.type,
    data: eventTypeLoc.data as Record<string, unknown>,
  };
}

export function toPublicLocationMetadata(
  type: LocationType | string | null | undefined,
  data: unknown
): PublicLocationMetadata | null {
  if (!type) return null;

  const parsed = parseEventTypeLocation(type, data);
  if (!parsed) return null;

  switch (parsed.type) {
    case "IN_PERSON": {
      return {
        type: "IN_PERSON",
        publicAddress: parsed.data.displayPublicAddress ? parsed.data.address : undefined,
        extraNotes: parsed.data.extraNotes,
      };
    }
    case "HOST_CALLS_ATTENDEE": {
      return {
        type: "HOST_CALLS_ATTENDEE",
        extraNotes: parsed.data.extraNotes,
      };
    }
    case "ATTENDEE_CALLS_HOST": {
      // Never expose host phone number on unauthenticated public discovery
      return {
        type: "ATTENDEE_CALLS_HOST",
        extraNotes: parsed.data.extraNotes,
      };
    }
    case "CUSTOM_LINK": {
      // Never expose custom URL on unauthenticated public discovery
      return {
        type: "CUSTOM_LINK",
        extraNotes: parsed.data.extraNotes,
      };
    }
    case "STATIC_VIDEO": {
      // Never expose video conferencing URL on unauthenticated public discovery
      return {
        type: "STATIC_VIDEO",
        extraNotes: parsed.data.extraNotes,
      };
    }
    case "ZOOM": {
      return {
        type: "ZOOM",
        extraNotes: parsed.data.extraNotes,
      };
    }
    default:
      return null;
  }
}
