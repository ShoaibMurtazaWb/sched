import type { LocationType } from "@prisma/client";

/**
 * Escapes characters per RFC 5545 Section 3.3.11 (Text):
 * A BACKSLASH (\) character is escaped as "\\".
 * A SEMICOLON (;) character is escaped as "\;".
 * A COMMA (,) character is escaped as "\,".
 * A LINE FEED character (CRLF or LF) is escaped as "\n".
 */
export function escapeIcsText(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds lines per RFC 5545 Section 3.1:
 * Lines of text SHOULD NOT be longer than 75 octets, excluding the line
 * break. Long content lines are split into a multiple line representations
 * using a line break followed immediately by a single space.
 */
export function foldIcsLine(line: string, maxOctets = 75): string {
  if (Buffer.byteLength(line, "utf8") <= maxOctets) {
    return line;
  }

  const result: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (currentBytes + charBytes > maxOctets) {
      result.push(current);
      current = " " + char;
      currentBytes = 1 + charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result.join("\r\n");
}

export interface IcsEventOptions {
  uid: string;
  sequence: number;
  dtstamp: Date;
  startTime: Date;
  endTime: Date;
  summary: string;
  description: string;
  status: "CONFIRMED" | "CANCELLED";
  locationType?: LocationType | string | null;
  locationData?: Record<string, unknown> | null;
  attendeePhoneNumber?: string | null;
  hostName?: string;
  attendeeName?: string;
}

export function generateIcsCalendar(event: IcsEventOptions): string {
  const formatIcsDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sched//Calendar Meeting Engine//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.status === "CANCELLED" ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${formatIcsDate(event.dtstamp)}`,
    `DTSTART:${formatIcsDate(event.startTime)}`,
    `DTEND:${formatIcsDate(event.endTime)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
  ];

  // Resolve location string & URL
  let locationStr: string | null = null;
  let urlStr: string | null = null;

  if (event.locationType && event.locationData) {
    const data = event.locationData;
    switch (event.locationType) {
      case "IN_PERSON": {
        if (typeof data.address === "string") {
          locationStr = data.address;
        }
        break;
      }
      case "HOST_CALLS_ATTENDEE": {
        const phone = event.attendeePhoneNumber || "phone";
        locationStr = `Host will call ${event.attendeeName || "attendee"} at ${phone}`;
        break;
      }
      case "ATTENDEE_CALLS_HOST": {
        const phone = (data.hostPhoneNumber as string) || "phone";
        locationStr = `Attendee will call ${event.hostName || "host"} at ${phone}`;
        break;
      }
      case "CUSTOM_LINK":
      case "STATIC_VIDEO": {
        if (typeof data.url === "string") {
          locationStr = data.url;
          urlStr = data.url;
        }
        break;
      }
      case "ZOOM": {
        if (typeof data.joinUrl === "string") {
          locationStr = data.joinUrl;
          urlStr = data.joinUrl;
        }
        break;
      }
    }
  }

  if (locationStr) {
    lines.push(`LOCATION:${escapeIcsText(locationStr)}`);
  }
  if (urlStr) {
    lines.push(`URL:${escapeIcsText(urlStr)}`);
  }

  let finalDescription = event.description;
  if (urlStr) {
    finalDescription += `\n\nJoin Meeting: ${urlStr}`;
  } else if (locationStr && event.locationType !== "IN_PERSON") {
    finalDescription += `\n\nLocation / Dial-in: ${locationStr}`;
  }

  lines.push(`DESCRIPTION:${escapeIcsText(finalDescription)}`);
  lines.push(`STATUS:${event.status}`);
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.map((l) => foldIcsLine(l)).join("\r\n");
}
