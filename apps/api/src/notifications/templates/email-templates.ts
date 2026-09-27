import { escapeHtml } from "../../shared/utils/html-escape";

export interface SnapshotPayload {
  bookingId: string;
  eventTypeId: string;
  eventTitle: string;
  eventSlug: string;
  durationMinutes: number;
  hostId: string;
  hostName: string;
  hostUsername: string;
  hostEmail: string;
  hostTimeZone: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeeTimeZone: string;
  attendeePhoneNumber?: string | null;
  attendeeNotes?: string;
  locationType?: string | null;
  locationData?: Record<string, unknown> | null;
  customResponses?: Array<{
    questionId: string;
    label: string;
    type: string;
    value: string | boolean;
    selectedOptionLabel?: string | null;
  }> | null;
  startUtc: string;
  endUtc: string;
  status: string;
  sequence: number;
  tokenVersion: number;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  previousStartUtc?: string | null;
  previousEndUtc?: string | null;
  rescheduleReason?: string | null;
  rescheduledBy?: string | null;
}

export function formatZonedDateTime(
  dateIso: string | Date,
  timeZone: string
): { formattedDate: string; formattedTime: string; tzLabel: string } {
  const date = new Date(dateIso);

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return {
    formattedDate: dateFormatter.format(date),
    formattedTime: timeFormatter.format(date),
    tzLabel: timeZone,
  };
}

export function formatZonedRange(
  startIso: string | Date,
  endIso: string | Date,
  timeZone: string
): { dateStr: string; timeRangeStr: string } {
  const start = formatZonedDateTime(startIso, timeZone);
  const end = formatZonedDateTime(endIso, timeZone);

  return {
    dateStr: start.formattedDate,
    timeRangeStr: `${start.formattedTime} – ${end.formattedTime} (${timeZone})`,
  };
}

function renderLocationHtml(snapshot: SnapshotPayload, recipient: "ATTENDEE" | "HOST"): string {
  if (!snapshot.locationType || !snapshot.locationData) {
    return "";
  }

  const data = snapshot.locationData;
  const safeNotes = typeof data.extraNotes === "string" && data.extraNotes ? `<br><small style="color: #64748b;">${escapeHtml(data.extraNotes)}</small>` : "";

  switch (snapshot.locationType) {
    case "IN_PERSON": {
      const address = typeof data.address === "string" ? escapeHtml(data.address) : "In-Person Venue";
      return `<div class="details-row"><span class="details-label">Location:</span><span class="details-value">📍 ${address}${safeNotes}</span></div>`;
    }
    case "HOST_CALLS_ATTENDEE": {
      const phone = snapshot.attendeePhoneNumber ? escapeHtml(snapshot.attendeePhoneNumber) : "Phone Call";
      if (recipient === "HOST") {
        return `<div class="details-row"><span class="details-label">Dial-in:</span><span class="details-value">📞 You will call attendee at: <strong>${phone}</strong>${safeNotes}</span></div>`;
      } else {
        return `<div class="details-row"><span class="details-label">Dial-in:</span><span class="details-value">📞 Host will call you at: <strong>${phone}</strong>${safeNotes}</span></div>`;
      }
    }
    case "ATTENDEE_CALLS_HOST": {
      const hostPhone = typeof data.hostPhoneNumber === "string" ? escapeHtml(data.hostPhoneNumber) : "Host Phone";
      if (recipient === "ATTENDEE") {
        return `<div class="details-row"><span class="details-label">Dial-in:</span><span class="details-value">📞 Call host at: <strong>${hostPhone}</strong>${safeNotes}</span></div>`;
      } else {
        return `<div class="details-row"><span class="details-label">Dial-in:</span><span class="details-value">📞 Attendee will call you at: <strong>${hostPhone}</strong>${safeNotes}</span></div>`;
      }
    }
    case "CUSTOM_LINK":
    case "STATIC_VIDEO": {
      const url = typeof data.url === "string" ? data.url : "";
      const safeUrl = escapeHtml(url);
      return `<div class="details-row"><span class="details-label">Meeting Link:</span><span class="details-value"><a href="${safeUrl}" style="color: #2563eb; text-decoration: underline;" target="_blank" rel="noopener noreferrer">${safeUrl}</a>${safeNotes}</span></div>`;
    }
    case "ZOOM": {
      const joinUrl = typeof data.joinUrl === "string" ? data.joinUrl : "";
      const safeJoinUrl = escapeHtml(joinUrl);
      const meetingId = typeof data.meetingId === "string" ? escapeHtml(data.meetingId) : "";
      const passcode = typeof data.password === "string" ? escapeHtml(data.password) : "";
      const details = [
        meetingId ? `Meeting ID: ${meetingId}` : "",
        passcode ? `Passcode: ${passcode}` : "",
      ].filter(Boolean).join(" &bull; ");
      const extraInfo = details ? `<br><small style="color: #64748b;">${details}</small>` : "";

      return `<div class="details-row"><span class="details-label">Zoom Meeting:</span><span class="details-value"><a href="${safeJoinUrl}" style="color: #2563eb; font-weight: 600; text-decoration: underline;" target="_blank" rel="noopener noreferrer">${safeJoinUrl || "Zoom link generated"}</a>${extraInfo}${safeNotes}</span></div>`;
    }
    default:
      return "";
  }
}

function renderLocationText(snapshot: SnapshotPayload, recipient: "ATTENDEE" | "HOST"): string {
  if (!snapshot.locationType || !snapshot.locationData) {
    return "";
  }

  const data = snapshot.locationData;
  const extraNotes = typeof data.extraNotes === "string" && data.extraNotes ? ` (${data.extraNotes})` : "";

  switch (snapshot.locationType) {
    case "IN_PERSON": {
      return `Location: 📍 ${data.address || "In-Person Venue"}${extraNotes}\n`;
    }
    case "HOST_CALLS_ATTENDEE": {
      const phone = snapshot.attendeePhoneNumber || "phone";
      return recipient === "HOST"
        ? `Location: 📞 You will call attendee at: ${phone}${extraNotes}\n`
        : `Location: 📞 Host will call you at: ${phone}${extraNotes}\n`;
    }
    case "ATTENDEE_CALLS_HOST": {
      const hostPhone = data.hostPhoneNumber || "host phone";
      return recipient === "ATTENDEE"
        ? `Location: 📞 Call host at: ${hostPhone}${extraNotes}\n`
        : `Location: 📞 Attendee will call you at: ${hostPhone}${extraNotes}\n`;
    }
    case "CUSTOM_LINK":
    case "STATIC_VIDEO": {
      return `Meeting Link: ${data.url || ""}${extraNotes}\n`;
    }
    case "ZOOM": {
      const joinUrl = data.joinUrl || "";
      const meetingId = data.meetingId ? ` (Meeting ID: ${data.meetingId})` : "";
      const passcode = data.password ? ` (Passcode: ${data.password})` : "";
      return `Zoom Meeting: ${joinUrl}${meetingId}${passcode}${extraNotes}\n`;
    }
    default:
      return "";
  }
}

function renderCustomResponsesHtml(snapshot: SnapshotPayload): string {
  if (!snapshot.customResponses || snapshot.customResponses.length === 0) {
    return "";
  }

  return snapshot.customResponses
    .map((r) => {
      const safeLabel = escapeHtml(r.label);
      let displayValue = "";
      if (r.type === "CHECKBOX") {
        displayValue = r.value ? "✓ Yes" : "No";
      } else if (r.type === "SELECT") {
        displayValue = r.selectedOptionLabel ? escapeHtml(r.selectedOptionLabel) : escapeHtml(String(r.value));
      } else {
        displayValue = escapeHtml(String(r.value));
      }
      return `<div class="details-row"><span class="details-label">${safeLabel}:</span><span class="details-value">${displayValue}</span></div>`;
    })
    .join("");
}

function renderCustomResponsesText(snapshot: SnapshotPayload): string {
  if (!snapshot.customResponses || snapshot.customResponses.length === 0) {
    return "";
  }

  return snapshot.customResponses
    .map((r) => {
      let displayValue = "";
      if (r.type === "CHECKBOX") {
        displayValue = r.value ? "Yes" : "No";
      } else if (r.type === "SELECT") {
        displayValue = r.selectedOptionLabel ? r.selectedOptionLabel : String(r.value);
      } else {
        displayValue = String(r.value);
      }
      return `${r.label}: ${displayValue}\n`;
    })
    .join("");
}

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sched</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; max-width: 580px; margin: 0 auto; padding: 36px 16px; box-sizing: border-box; }
    .brand-header { text-align: center; margin-bottom: 24px; }
    .brand-table { margin: 0 auto; }
    .card { background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03), 0 2px 4px -2px rgba(0,0,0,0.02); }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .badge-success { background-color: #eff6ff; color: #0069ff; border: 1px solid #bfdbfe; }
    .badge-info { background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
    .badge-danger { background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    h1 { font-size: 24px; font-weight: 800; margin: 12px 0 6px 0; color: #0b2545; line-height: 1.3; letter-spacing: -0.02em; }
    .datetime-header { font-size: 15px; font-weight: 700; color: #0069ff; margin: 6px 0 16px 0; line-height: 1.4; }
    p { font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 16px 0; }
    .zoom-cta-box { background-color: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 22px 20px; text-align: center; margin: 20px 0; }
    .zoom-btn { display: inline-block; background-color: #2D8CFF; color: #ffffff !important; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-size: 15px; font-weight: 700; box-shadow: 0 3px 8px rgba(45,140,255,0.35); text-align: center; }
    .details-box { background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 18px; margin: 20px 0; }
    .details-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .details-row:last-child { border-bottom: none; }
    .details-label { color: #64748b; font-weight: 500; }
    .details-value { color: #0f172a; font-weight: 600; text-align: right; }
    .btn { display: inline-block; background-color: #0069ff; color: #ffffff !important; text-decoration: none; padding: 10px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; text-align: center; }
    .action-links { text-align: center; margin-top: 24px; padding-top: 18px; border-top: 1px solid #f1f5f9; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #94a3b8; line-height: 1.5; }
    .strikethrough { text-decoration: line-through; color: #94a3b8; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="brand-header">
      <table cellpadding="0" cellspacing="0" border="0" class="brand-table">
        <tr>
          <td style="vertical-align: middle; padding-right: 10px;">
            <div style="width: 36px; height: 36px; background-color: #0069ff; border-radius: 10px; text-align: center; line-height: 36px; color: #ffffff; font-weight: 800; font-size: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: inline-block;">
              S
            </div>
          </td>
          <td style="vertical-align: middle;">
            <span style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Sched</span>
          </td>
        </tr>
      </table>
    </div>
    <div class="card">
      ${content}
    </div>
    <div class="footer">
      Sent via <strong>Sched</strong> &bull; Simple, conflict-free scheduling
    </div>
  </div>
</body>
</html>`;
}

function renderZoomCtaHtml(snapshot: SnapshotPayload): string {
  if (snapshot.locationType !== "ZOOM" || !snapshot.locationData) {
    return "";
  }

  const data = snapshot.locationData;
  const joinUrl = typeof data.joinUrl === "string" ? data.joinUrl : "";
  const safeJoinUrl = escapeHtml(joinUrl);
  const meetingId = typeof data.meetingId === "string" ? escapeHtml(data.meetingId) : "";
  const passcode = typeof data.password === "string" ? escapeHtml(data.password) : "";

  return `
    <div class="zoom-cta-box">
      <div style="font-size: 11px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">
        🎥 Zoom Video Conference
      </div>
      <div style="margin-bottom: 12px;">
        <a href="${safeJoinUrl}" class="zoom-btn" target="_blank" rel="noopener noreferrer">
          Join Zoom Meeting
        </a>
      </div>
      <div style="font-size: 12px; color: #475569; word-break: break-all; margin-top: 8px;">
        <a href="${safeJoinUrl}" style="color: #2563eb; text-decoration: underline;" target="_blank" rel="noopener noreferrer">${safeJoinUrl || "Join Zoom"}</a>
      </div>
      ${
        meetingId || passcode
          ? `<div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #bfdbfe; font-size: 13px; color: #1e293b;">
              ${
                meetingId
                  ? `<span><strong>Meeting ID:</strong> <code style="background: #e0f2fe; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${meetingId}</code></span>`
                  : ""
              }
              ${meetingId && passcode ? ` &nbsp;&bull;&nbsp; ` : ""}
              ${
                passcode
                  ? `<span><strong>Passcode:</strong> <code style="background: #e0f2fe; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${passcode}</code></span>`
                  : ""
              }
            </div>`
          : ""
      }
    </div>
  `;
}

export function renderBookingConfirmedAttendee(
  snapshot: SnapshotPayload,
  manageUrl: string
): { subject: string; html: string; text: string } {
  const { dateStr, timeRangeStr } = formatZonedRange(
    snapshot.startUtc,
    snapshot.endUtc,
    snapshot.attendeeTimeZone
  );

  const subject = `Confirmed: ${snapshot.eventTitle} with ${snapshot.hostName}`;

  const safeEventTitle = escapeHtml(snapshot.eventTitle);
  const safeHostName = escapeHtml(snapshot.hostName);
  const safeHostEmail = escapeHtml(snapshot.hostEmail);
  const safeAttendeeNotes = snapshot.attendeeNotes ? escapeHtml(snapshot.attendeeNotes) : "";
  const locationHtml = renderLocationHtml(snapshot, "ATTENDEE");
  const locationText = renderLocationText(snapshot, "ATTENDEE");
  const customResponsesHtml = renderCustomResponsesHtml(snapshot);
  const customResponsesText = renderCustomResponsesText(snapshot);
  const zoomCtaHtml = renderZoomCtaHtml(snapshot);

  const rescheduleUrl = `${manageUrl}#reschedule`;
  const cancelUrl = `${manageUrl}#cancel`;

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge badge-success">Confirmed</span>
      <h1>${safeEventTitle}</h1>
      <div class="datetime-header">
        🗓 ${dateStr} &bull; ${timeRangeStr}
      </div>
      <p style="margin: 0; font-size: 13px; color: #64748b;">
        Your meeting with <strong>${safeHostName}</strong> has been scheduled.
      </p>
    </div>

    ${zoomCtaHtml}

    <div class="details-box">
      <div class="details-row"><span class="details-label">Event:</span><span class="details-value">${safeEventTitle}</span></div>
      <div class="details-row"><span class="details-label">Date:</span><span class="details-value">${dateStr}</span></div>
      <div class="details-row"><span class="details-label">Time:</span><span class="details-value">${timeRangeStr}</span></div>
      <div class="details-row"><span class="details-label">Duration:</span><span class="details-value">${snapshot.durationMinutes} mins</span></div>
      <div class="details-row"><span class="details-label">Host:</span><span class="details-value">${safeHostName} (${safeHostEmail})</span></div>
      ${locationHtml}
      ${customResponsesHtml}
      ${
        safeAttendeeNotes
          ? `<div class="details-row"><span class="details-label">Your Notes:</span><span class="details-value">${safeAttendeeNotes}</span></div>`
          : ""
      }
    </div>

    <div class="action-links">
      <p style="margin: 0 0 12px 0; font-size: 12px; color: #64748b;">
        📎 A calendar invitation (.ics) is attached to this email.
      </p>
      <div style="margin-bottom: 12px;">
        <a href="${manageUrl}" class="btn" style="background-color: #0069ff; margin: 4px;">View Booking Details</a>
        <a href="${rescheduleUrl}" class="btn" style="background-color: #f1f5f9; color: #0f172a !important; border: 1px solid #cbd5e1; margin: 4px;">Reschedule</a>
        <a href="${cancelUrl}" class="btn" style="background-color: #ffffff; color: #dc2626 !important; border: 1px solid #fecaca; margin: 4px;">Cancel</a>
      </div>
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        Need to make changes? You can reschedule or cancel anytime before the meeting starts.
      </p>
    </div>
  `);

  const zoomData = snapshot.locationType === "ZOOM" && snapshot.locationData ? snapshot.locationData : null;
  const zoomText = zoomData && typeof zoomData.joinUrl === "string"
    ? `\nZOOM MEETING:\nJoin URL: ${zoomData.joinUrl}${zoomData.meetingId ? `\nMeeting ID: ${zoomData.meetingId}` : ""}${zoomData.password ? `\nPasscode: ${zoomData.password}` : ""}\n`
    : "";

  const text = `CONFIRMED: ${snapshot.eventTitle} with ${snapshot.hostName}

Date: ${dateStr}
Time: ${timeRangeStr}
Duration: ${snapshot.durationMinutes} minutes
Host: ${snapshot.hostName} (${snapshot.hostEmail})
${locationText}${zoomText}${customResponsesText}${snapshot.attendeeNotes ? `Your Notes: ${snapshot.attendeeNotes}\n` : ""}
Manage Booking: ${manageUrl}
Reschedule: ${rescheduleUrl}
Cancel: ${cancelUrl}

A calendar invite (.ics) has been attached to this email.
`;

  return { subject, html, text };
}

export function renderBookingConfirmedHost(
  snapshot: SnapshotPayload,
  appUrl: string,
  manageUrl?: string
): { subject: string; html: string; text: string } {
  const { dateStr, timeRangeStr } = formatZonedRange(
    snapshot.startUtc,
    snapshot.endUtc,
    snapshot.hostTimeZone
  );

  const dashboardUrl = `${appUrl}/dashboard/bookings`;
  const subject = `New Booking: ${snapshot.attendeeName} - ${snapshot.eventTitle}`;

  const safeEventTitle = escapeHtml(snapshot.eventTitle);
  const safeAttendeeName = escapeHtml(snapshot.attendeeName);
  const safeAttendeeEmail = escapeHtml(snapshot.attendeeEmail);
  const safeHostName = escapeHtml(snapshot.hostName);
  const safeHostEmail = escapeHtml(snapshot.hostEmail);
  const safeAttendeeNotes = snapshot.attendeeNotes ? escapeHtml(snapshot.attendeeNotes) : "";
  const locationHtml = renderLocationHtml(snapshot, "HOST");
  const locationText = renderLocationText(snapshot, "HOST");
  const customResponsesHtml = renderCustomResponsesHtml(snapshot);
  const customResponsesText = renderCustomResponsesText(snapshot);
  const zoomCtaHtml = renderZoomCtaHtml(snapshot);

  const rescheduleUrl = manageUrl ? `${manageUrl}#reschedule` : dashboardUrl;
  const cancelUrl = manageUrl ? `${manageUrl}#cancel` : dashboardUrl;

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge badge-info">New Booking</span>
      <h1>${safeEventTitle}</h1>
      <div class="datetime-header">
        🗓 ${dateStr} &bull; ${timeRangeStr}
      </div>
      <p style="margin: 0; font-size: 13px; color: #64748b;">
        <strong>${safeAttendeeName}</strong> has scheduled a meeting with you.
      </p>
    </div>

    ${zoomCtaHtml}

    <div class="details-box">
      <div class="details-row"><span class="details-label">Event:</span><span class="details-value">${safeEventTitle}</span></div>
      <div class="details-row"><span class="details-label">Attendee:</span><span class="details-value">${safeAttendeeName} (${safeAttendeeEmail})</span></div>
      <div class="details-row"><span class="details-label">Date:</span><span class="details-value">${dateStr}</span></div>
      <div class="details-row"><span class="details-label">Time:</span><span class="details-value">${timeRangeStr}</span></div>
      <div class="details-row"><span class="details-label">Duration:</span><span class="details-value">${snapshot.durationMinutes} mins</span></div>
      <div class="details-row"><span class="details-label">Host:</span><span class="details-value">${safeHostName} (${safeHostEmail})</span></div>
      ${locationHtml}
      ${customResponsesHtml}
      ${
        safeAttendeeNotes
          ? `<div class="details-row"><span class="details-label">Attendee Notes:</span><span class="details-value">${safeAttendeeNotes}</span></div>`
          : ""
      }
    </div>

    <div class="action-links">
      <p style="margin: 0 0 12px 0; font-size: 12px; color: #64748b;">
        📎 A calendar invitation (.ics) is attached to this email.
      </p>
      <div style="margin-bottom: 12px;">
        <a href="${dashboardUrl}" class="btn" style="background-color: #0069ff; margin: 4px;">View in Dashboard</a>
        <a href="${rescheduleUrl}" class="btn" style="background-color: #f1f5f9; color: #0f172a !important; border: 1px solid #cbd5e1; margin: 4px;">Reschedule</a>
        <a href="${cancelUrl}" class="btn" style="background-color: #ffffff; color: #dc2626 !important; border: 1px solid #fecaca; margin: 4px;">Cancel</a>
      </div>
    </div>
  `);

  const zoomData = snapshot.locationType === "ZOOM" && snapshot.locationData ? snapshot.locationData : null;
  const zoomText = zoomData && typeof zoomData.joinUrl === "string"
    ? `\nZOOM MEETING:\nJoin URL: ${zoomData.joinUrl}${zoomData.meetingId ? `\nMeeting ID: ${zoomData.meetingId}` : ""}${zoomData.password ? `\nPasscode: ${zoomData.password}` : ""}\n`
    : "";

  const text = `NEW BOOKING: ${snapshot.attendeeName} - ${snapshot.eventTitle}

Attendee: ${snapshot.attendeeName} (${snapshot.attendeeEmail})
Date: ${dateStr}
Time: ${timeRangeStr}
Duration: ${snapshot.durationMinutes} minutes
${locationText}${zoomText}${customResponsesText}${snapshot.attendeeNotes ? `Attendee Notes: ${snapshot.attendeeNotes}\n` : ""}
Dashboard: ${dashboardUrl}
Reschedule: ${rescheduleUrl}
Cancel: ${cancelUrl}

A calendar invite (.ics) has been attached to this email.
`;

  return { subject, html, text };
}

export function renderBookingRescheduledAttendee(
  snapshot: SnapshotPayload,
  manageUrl: string
): { subject: string; html: string; text: string } {
  const { dateStr: newDateStr, timeRangeStr: newTimeRangeStr } = formatZonedRange(
    snapshot.startUtc,
    snapshot.endUtc,
    snapshot.attendeeTimeZone
  );

  let previousTimeStr = "";
  if (snapshot.previousStartUtc && snapshot.previousEndUtc) {
    const prev = formatZonedRange(
      snapshot.previousStartUtc,
      snapshot.previousEndUtc,
      snapshot.attendeeTimeZone
    );
    previousTimeStr = `${prev.dateStr}, ${prev.timeRangeStr}`;
  }

  const subject = `Rescheduled: ${snapshot.eventTitle} with ${snapshot.hostName}`;

  const safeEventTitle = escapeHtml(snapshot.eventTitle);
  const safeHostName = escapeHtml(snapshot.hostName);
  const safeHostEmail = escapeHtml(snapshot.hostEmail);
  const safeReason = snapshot.rescheduleReason ? escapeHtml(snapshot.rescheduleReason) : "";
  const locationHtml = renderLocationHtml(snapshot, "ATTENDEE");
  const locationText = renderLocationText(snapshot, "ATTENDEE");
  const zoomCtaHtml = renderZoomCtaHtml(snapshot);

  const rescheduleUrl = `${manageUrl}#reschedule`;
  const cancelUrl = `${manageUrl}#cancel`;

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge badge-info">Rescheduled</span>
      <h1>${safeEventTitle}</h1>
      <div class="datetime-header">
        🗓 ${newDateStr} &bull; ${newTimeRangeStr}
      </div>
      <p style="margin: 0; font-size: 13px; color: #64748b;">
        Your meeting with <strong>${safeHostName}</strong> has been moved to a new time.
      </p>
    </div>

    ${zoomCtaHtml}

    <div class="details-box">
      <div class="details-row"><span class="details-label">Event:</span><span class="details-value">${safeEventTitle}</span></div>
      <div class="details-row"><span class="details-label">New Date:</span><span class="details-value">${newDateStr}</span></div>
      <div class="details-row"><span class="details-label">New Time:</span><span class="details-value" style="color: #2563eb;">${newTimeRangeStr}</span></div>
      ${
        previousTimeStr
          ? `<div class="details-row"><span class="details-label">Previous Time:</span><span class="details-value strikethrough">${previousTimeStr}</span></div>`
          : ""
      }
      <div class="details-row"><span class="details-label">Host:</span><span class="details-value">${safeHostName} (${safeHostEmail})</span></div>
      ${locationHtml}
      ${
        safeReason
          ? `<div class="details-row"><span class="details-label">Reason:</span><span class="details-value">"${safeReason}"</span></div>`
          : ""
      }
    </div>

    <div class="action-links">
      <p style="margin: 0 0 12px 0; font-size: 12px; color: #64748b;">
        📎 An updated calendar invitation (.ics) is attached to this email.
      </p>
      <div style="margin-bottom: 12px;">
        <a href="${manageUrl}" class="btn" style="background-color: #0069ff; margin: 4px;">View Updated Details</a>
        <a href="${rescheduleUrl}" class="btn" style="background-color: #f1f5f9; color: #0f172a !important; border: 1px solid #cbd5e1; margin: 4px;">Reschedule</a>
        <a href="${cancelUrl}" class="btn" style="background-color: #ffffff; color: #dc2626 !important; border: 1px solid #fecaca; margin: 4px;">Cancel</a>
      </div>
    </div>
  `);

  const zoomData = snapshot.locationType === "ZOOM" && snapshot.locationData ? snapshot.locationData : null;
  const zoomText = zoomData && typeof zoomData.joinUrl === "string"
    ? `\nZOOM MEETING:\nJoin URL: ${zoomData.joinUrl}${zoomData.meetingId ? `\nMeeting ID: ${zoomData.meetingId}` : ""}${zoomData.password ? `\nPasscode: ${zoomData.password}` : ""}\n`
    : "";

  const text = `RESCHEDULED: ${snapshot.eventTitle} with ${snapshot.hostName}

New Date: ${newDateStr}
New Time: ${newTimeRangeStr}
${previousTimeStr ? `Previous Time: ${previousTimeStr}\n` : ""}Host: ${snapshot.hostName} (${snapshot.hostEmail})
${locationText}${zoomText}${snapshot.rescheduleReason ? `Reason: "${snapshot.rescheduleReason}"\n` : ""}
Manage / Reschedule: ${manageUrl}
Cancel: ${cancelUrl}

An updated calendar invite (.ics) is attached to this email.
`;

  return { subject, html, text };
}

export function renderBookingRescheduledHost(
  snapshot: SnapshotPayload,
  appUrl: string,
  manageUrl?: string
): { subject: string; html: string; text: string } {
  const { dateStr: newDateStr, timeRangeStr: newTimeRangeStr } = formatZonedRange(
    snapshot.startUtc,
    snapshot.endUtc,
    snapshot.hostTimeZone
  );

  let previousTimeStr = "";
  if (snapshot.previousStartUtc && snapshot.previousEndUtc) {
    const prev = formatZonedRange(
      snapshot.previousStartUtc,
      snapshot.previousEndUtc,
      snapshot.hostTimeZone
    );
    previousTimeStr = `${prev.dateStr}, ${prev.timeRangeStr}`;
  }

  const dashboardUrl = `${appUrl}/dashboard/bookings`;
  const subject = `Booking Rescheduled: ${snapshot.attendeeName} - ${snapshot.eventTitle}`;

  const safeEventTitle = escapeHtml(snapshot.eventTitle);
  const safeAttendeeName = escapeHtml(snapshot.attendeeName);
  const safeAttendeeEmail = escapeHtml(snapshot.attendeeEmail);
  const safeReason = snapshot.rescheduleReason ? escapeHtml(snapshot.rescheduleReason) : "";
  const locationHtml = renderLocationHtml(snapshot, "HOST");
  const locationText = renderLocationText(snapshot, "HOST");
  const zoomCtaHtml = renderZoomCtaHtml(snapshot);

  const rescheduleUrl = manageUrl ? `${manageUrl}#reschedule` : dashboardUrl;
  const cancelUrl = manageUrl ? `${manageUrl}#cancel` : dashboardUrl;

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge badge-info">Rescheduled</span>
      <h1>${safeEventTitle}</h1>
      <div class="datetime-header">
        🗓 ${newDateStr} &bull; ${newTimeRangeStr}
      </div>
      <p style="margin: 0; font-size: 13px; color: #64748b;">
        Meeting with <strong>${safeAttendeeName}</strong> has been moved to a new time.
      </p>
    </div>

    ${zoomCtaHtml}

    <div class="details-box">
      <div class="details-row"><span class="details-label">Event:</span><span class="details-value">${safeEventTitle}</span></div>
      <div class="details-row"><span class="details-label">Attendee:</span><span class="details-value">${safeAttendeeName} (${safeAttendeeEmail})</span></div>
      <div class="details-row"><span class="details-label">New Date:</span><span class="details-value">${newDateStr}</span></div>
      <div class="details-row"><span class="details-label">New Time:</span><span class="details-value" style="color: #2563eb;">${newTimeRangeStr}</span></div>
      ${
        previousTimeStr
          ? `<div class="details-row"><span class="details-label">Previous Time:</span><span class="details-value strikethrough">${previousTimeStr}</span></div>`
          : ""
      }
      ${locationHtml}
      ${
        safeReason
          ? `<div class="details-row"><span class="details-label">Reason:</span><span class="details-value">"${safeReason}"</span></div>`
          : ""
      }
    </div>

    <div class="action-links">
      <p style="margin: 0 0 12px 0; font-size: 12px; color: #64748b;">
        📎 An updated calendar invitation (.ics) is attached to this email.
      </p>
      <div style="margin-bottom: 12px;">
        <a href="${dashboardUrl}" class="btn" style="background-color: #0069ff; margin: 4px;">View in Dashboard</a>
        <a href="${rescheduleUrl}" class="btn" style="background-color: #f1f5f9; color: #0f172a !important; border: 1px solid #cbd5e1; margin: 4px;">Reschedule</a>
        <a href="${cancelUrl}" class="btn" style="background-color: #ffffff; color: #dc2626 !important; border: 1px solid #fecaca; margin: 4px;">Cancel</a>
      </div>
    </div>
  `);

  const zoomData = snapshot.locationType === "ZOOM" && snapshot.locationData ? snapshot.locationData : null;
  const zoomText = zoomData && typeof zoomData.joinUrl === "string"
    ? `\nZOOM MEETING:\nJoin URL: ${zoomData.joinUrl}${zoomData.meetingId ? `\nMeeting ID: ${zoomData.meetingId}` : ""}${zoomData.password ? `\nPasscode: ${zoomData.password}` : ""}\n`
    : "";

  const text = `RESCHEDULED: ${snapshot.attendeeName} - ${snapshot.eventTitle}

Attendee: ${snapshot.attendeeName} (${snapshot.attendeeEmail})
New Date: ${newDateStr}
New Time: ${newTimeRangeStr}
${previousTimeStr ? `Previous Time: ${previousTimeStr}\n` : ""}${locationText}${zoomText}${snapshot.rescheduleReason ? `Reason: "${snapshot.rescheduleReason}"\n` : ""}
Dashboard: ${dashboardUrl}
Reschedule: ${rescheduleUrl}
Cancel: ${cancelUrl}

An updated calendar invite (.ics) is attached to this email.
`;

  return { subject, html, text };
}

export function renderBookingCancelledAttendee(
  snapshot: SnapshotPayload,
  appUrl: string
): { subject: string; html: string; text: string } {
  const { dateStr, timeRangeStr } = formatZonedRange(
    snapshot.startUtc,
    snapshot.endUtc,
    snapshot.attendeeTimeZone
  );

  const rebookUrl = `${appUrl}/public/${snapshot.hostUsername}/${snapshot.eventSlug}`;
  const subject = `Cancelled: ${snapshot.eventTitle} with ${snapshot.hostName}`;

  const safeEventTitle = escapeHtml(snapshot.eventTitle);
  const safeHostName = escapeHtml(snapshot.hostName);
  const safeReason = snapshot.cancellationReason ? escapeHtml(snapshot.cancellationReason) : "";

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge badge-danger">Cancelled</span>
      <h1>Meeting Cancelled</h1>
      <p>Your session with <strong>${safeHostName}</strong> has been cancelled.</p>
    </div>

    <div class="details-box">
      <div class="details-row"><span class="details-label">Event:</span><span class="details-value">${safeEventTitle}</span></div>
      <div class="details-row"><span class="details-label">Scheduled Date:</span><span class="details-value">${dateStr}</span></div>
      <div class="details-row"><span class="details-label">Scheduled Time:</span><span class="details-value">${timeRangeStr}</span></div>
      ${
        safeReason
          ? `<div class="details-row"><span class="details-label">Host Reason:</span><span class="details-value" style="color: #dc2626;">"${safeReason}"</span></div>`
          : ""
      }
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <a href="${rebookUrl}" class="btn">Book Another Time</a>
    </div>
  `);

  const text = `CANCELLED: ${snapshot.eventTitle} with ${snapshot.hostName}

Your meeting has been cancelled by ${snapshot.hostName}.

Scheduled Date: ${dateStr}
Scheduled Time: ${timeRangeStr}
${snapshot.cancellationReason ? `Reason: "${snapshot.cancellationReason}"\n` : ""}
Book another time: ${rebookUrl}
`;

  return { subject, html, text };
}

export function renderBookingCancelledHost(
  snapshot: SnapshotPayload,
  appUrl: string
): { subject: string; html: string; text: string } {
  const { dateStr, timeRangeStr } = formatZonedRange(
    snapshot.startUtc,
    snapshot.endUtc,
    snapshot.hostTimeZone
  );

  const dashboardUrl = `${appUrl}/dashboard/bookings`;
  const subject = `Booking Cancelled: ${snapshot.attendeeName} - ${snapshot.eventTitle}`;

  const safeEventTitle = escapeHtml(snapshot.eventTitle);
  const safeAttendeeName = escapeHtml(snapshot.attendeeName);
  const safeAttendeeEmail = escapeHtml(snapshot.attendeeEmail);
  const safeReason = snapshot.cancellationReason ? escapeHtml(snapshot.cancellationReason) : "";

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge badge-danger">Cancelled</span>
      <h1>Attendee Cancelled</h1>
      <p><strong>${safeAttendeeName}</strong> has cancelled their scheduled booking. The slot has been released back into your availability.</p>
    </div>

    <div class="details-box">
      <div class="details-row"><span class="details-label">Event:</span><span class="details-value">${safeEventTitle}</span></div>
      <div class="details-row"><span class="details-label">Attendee:</span><span class="details-value">${safeAttendeeName} (${safeAttendeeEmail})</span></div>
      <div class="details-row"><span class="details-label">Scheduled Date:</span><span class="details-value">${dateStr}</span></div>
      <div class="details-row"><span class="details-label">Scheduled Time:</span><span class="details-value">${timeRangeStr}</span></div>
      ${
        safeReason
          ? `<div class="details-row"><span class="details-label">Attendee Reason:</span><span class="details-value" style="color: #dc2626;">"${safeReason}"</span></div>`
          : ""
      }
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <a href="${dashboardUrl}" class="btn">View Bookings Dashboard</a>
    </div>
  `);

  const text = `BOOKING CANCELLED: ${snapshot.attendeeName} - ${snapshot.eventTitle}

${snapshot.attendeeName} has cancelled their booking. The time slot has been freed on your calendar.

Scheduled Date: ${dateStr}
Scheduled Time: ${timeRangeStr}
Attendee: ${snapshot.attendeeName} (${snapshot.attendeeEmail})
${snapshot.cancellationReason ? `Reason: "${snapshot.cancellationReason}"\n` : ""}
Dashboard: ${dashboardUrl}
`;

  return { subject, html, text };
}

export function renderBookingReminderAttendee(
  snapshot: SnapshotPayload,
  manageUrl: string,
  timeframeLabel = "in 24 hours"
): { subject: string; html: string; text: string } {
  const { dateStr, timeRangeStr } = formatZonedRange(
    snapshot.startUtc,
    snapshot.endUtc,
    snapshot.attendeeTimeZone
  );

  const subject = `Reminder: ${snapshot.eventTitle} with ${snapshot.hostName} is coming up ${timeframeLabel}`;

  const safeEventTitle = escapeHtml(snapshot.eventTitle);
  const safeHostName = escapeHtml(snapshot.hostName);
  const locationHtml = renderLocationHtml(snapshot, "ATTENDEE");
  const customQuestionsHtml = renderCustomResponsesHtml(snapshot);

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge badge-info">Upcoming Meeting Reminder</span>
      <h1>${safeEventTitle}</h1>
      <p>Hi <strong>${escapeHtml(snapshot.attendeeName)}</strong>, this is a reminder that your meeting with <strong>${safeHostName}</strong> is starting ${timeframeLabel}.</p>
    </div>

    <div class="details-box">
      <div class="details-row"><span class="details-label">Host:</span><span class="details-value">${safeHostName}</span></div>
      <div class="details-row"><span class="details-label">Date:</span><span class="details-value">${dateStr}</span></div>
      <div class="details-row"><span class="details-label">Time:</span><span class="details-value">${timeRangeStr}</span></div>
      ${locationHtml}
      ${customQuestionsHtml}
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <a href="${manageUrl}" class="btn">Manage / Reschedule Booking</a>
    </div>
  `);

  const locationText = renderLocationText(snapshot, "ATTENDEE");
  const customQuestionsText = renderCustomResponsesText(snapshot);

  const text = `REMINDER: ${snapshot.eventTitle} with ${snapshot.hostName} is starting ${timeframeLabel}

Hi ${snapshot.attendeeName},

This is a reminder for your upcoming meeting with ${snapshot.hostName}.

Date: ${dateStr}
Time: ${timeRangeStr}
${locationText ? `${locationText}\n` : ""}${customQuestionsText ? `${customQuestionsText}\n` : ""}
Manage, reschedule, or cancel:
${manageUrl}
`;

  return { subject, html, text };
}

export function renderWelcomeVerificationEmail(
  user: { name: string; email: string; username: string },
  appUrl: string
): { subject: string; html: string; text: string } {
  const subject = `Welcome to Sched, ${user.name}! 🚀 Let's create your first event`;
  const safeName = escapeHtml(user.name);
  const newEventTypeUrl = `${appUrl}/dashboard/event-types/new`;
  const dashboardUrl = `${appUrl}/dashboard`;

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-success">Account Created</span>
      <h1 style="font-size: 24px; font-weight: 800; margin: 16px 0 8px 0; color: #0f172a;">Welcome to Sched, ${safeName}! 🎉</h1>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; max-width: 480px; margin: 0 auto;">
        You're all set to start scheduling meetings effortlessly. Share your custom booking links and let clients, colleagues, and friends book time with you without the email back-and-forth.
      </p>
    </div>

    <!-- Quick Start Card -->
    <div style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; margin: 24px 0; text-align: left;">
      <div style="font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px;">
        🚀 Quick Start in 3 Easy Steps:
      </div>
      
      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 12px;">
        <tr>
          <td style="width: 28px; vertical-align: top; font-size: 16px; padding-top: 1px;">⚡</td>
          <td style="font-size: 13px; color: #334155; line-height: 1.5;">
            <strong>1. Create an Event Type</strong><br>
            <span style="color: #64748b; font-size: 12px;">Set your duration (15 min, 30 min, 1 hour) and location (Zoom, Google Meet, In-Person).</span>
          </td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 12px;">
        <tr>
          <td style="width: 28px; vertical-align: top; font-size: 16px; padding-top: 1px;">🕒</td>
          <td style="font-size: 13px; color: #334155; line-height: 1.5;">
            <strong>2. Set Your Availability</strong><br>
            <span style="color: #64748b; font-size: 12px;">Define the exact hours and days you are open for bookings.</span>
          </td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
        <tr>
          <td style="width: 28px; vertical-align: top; font-size: 16px; padding-top: 1px;">🔗</td>
          <td style="font-size: 13px; color: #334155; line-height: 1.5;">
            <strong>3. Share Your Booking Link</strong><br>
            <span style="color: #64748b; font-size: 12px;">Add it to your email signature, LinkedIn, or send directly to anyone.</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Primary CTA -->
    <div style="text-align: center; margin-top: 28px;">
      <a href="${newEventTypeUrl}" class="btn" style="background-color: #0069ff; color: #ffffff !important; padding: 14px 32px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 10px; display: inline-block;">
        Create Your First Event Type →
      </a>
    </div>

    <!-- Secondary Link -->
    <div style="text-align: center; margin-top: 16px;">
      <a href="${dashboardUrl}" style="color: #64748b; font-size: 13px; text-decoration: underline; font-weight: 500;">
        Or go directly to your Dashboard
      </a>
    </div>
  `);

  const text = `WELCOME TO SCHED, ${user.name}!

You're all set to start scheduling meetings effortlessly.

Quick Start in 3 Easy Steps:
1. Create an Event Type (Zoom, Google Meet, In-Person, 15m/30m/1h)
2. Set your availability and working hours
3. Share your booking link to eliminate email back-and-forth

Get started by creating your first event type:
${newEventTypeUrl}

Dashboard: ${dashboardUrl}

Powered by Sched
`;

  return { subject, html, text };
}

export function renderLoginSecurityAlertEmail(
  user: { name: string; email: string },
  loginInfo: { timeIso: string; ip?: string; userAgent?: string },
  appUrl: string
): { subject: string; html: string; text: string } {
  const subject = `Security Alert: New sign-in to your Sched account`;
  const safeName = escapeHtml(user.name);
  const safeEmail = escapeHtml(user.email);
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(loginInfo.timeIso));
  const dashboardUrl = `${appUrl}/dashboard`;
  const changePasswordUrl = `${appUrl}/dashboard/settings?tab=security`;

  const html = baseHtml(`
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-danger">🛡️ Security Alert</span>
      <h1 style="font-size: 22px; font-weight: 800; margin: 16px 0 8px 0; color: #0f172a;">New Sign-in Detected</h1>
      <p style="font-size: 14px; color: #475569; line-height: 1.6; max-width: 480px; margin: 0 auto;">
        Hi <strong>${safeName}</strong>, your Sched account (<strong>${safeEmail}</strong>) was just accessed from a new device or session.
      </p>
    </div>

    <!-- Sign-in Details Box -->
    <div class="details-box" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 18px; margin: 20px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
        Session Details:
      </div>
      <div class="details-row"><span class="details-label">Date & Time:</span><span class="details-value">${formattedDate} (UTC)</span></div>
      ${loginInfo.ip ? `<div class="details-row"><span class="details-label">IP Address:</span><span class="details-value" style="font-family: monospace; font-size: 12px;">${escapeHtml(loginInfo.ip)}</span></div>` : ""}
      ${loginInfo.userAgent ? `<div class="details-row"><span class="details-label">Browser / Client:</span><span class="details-value" style="font-size: 12px; max-width: 260px; word-break: break-all;">${escapeHtml(loginInfo.userAgent)}</span></div>` : ""}
      <div class="details-row"><span class="details-label">Status:</span><span class="details-value" style="color: #059669;">✓ Successful Sign-in</span></div>
    </div>

    <!-- Alert Guidance Box -->
    <div style="background-color: #fff7ed; border-radius: 10px; border: 1px solid #ffedd5; padding: 16px; margin: 20px 0; font-size: 13px; color: #9a3412; line-height: 1.5; text-align: left;">
      <strong>⚠️ Did not authorize this sign-in?</strong><br>
      If you did not sign in at this time, your password may be compromised. We strongly recommend changing your password immediately to protect your account and connected calendars.
    </div>

    <!-- Primary Urgent CTA -->
    <div style="text-align: center; margin-top: 24px;">
      <a href="${changePasswordUrl}" class="btn" style="background-color: #dc2626; color: #ffffff !important; padding: 13px 28px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 10px; display: inline-block; box-shadow: 0 2px 6px rgba(220, 38, 38, 0.25);">
        Change Password & Secure Account →
      </a>
    </div>

    <!-- Secondary Safe Notice -->
    <div style="text-align: center; margin-top: 18px; font-size: 12px; color: #64748b;">
      If this was you, you can safely disregard this email or <a href="${dashboardUrl}" style="color: #0069ff; text-decoration: underline;">visit your Dashboard</a>.
    </div>
  `);

  const text = `SECURITY ALERT: New sign-in to your Sched account

Hi ${user.name},

A new sign-in was detected for your Sched account (${user.email}).

Session Details:
- Date & Time: ${formattedDate} (UTC)
${loginInfo.ip ? `- IP Address: ${loginInfo.ip}\n` : ""}${loginInfo.userAgent ? `- Device/Browser: ${loginInfo.userAgent}\n` : ""}- Status: Successful Sign-in

IF THIS WAS NOT YOU:
Change your password immediately to secure your account:
${changePasswordUrl}

If this was you, you can safely disregard this email.

Dashboard: ${dashboardUrl}

Powered by Sched
`;

  return { subject, html, text };
}
