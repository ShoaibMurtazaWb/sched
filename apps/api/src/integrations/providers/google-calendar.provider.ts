import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CalendarCredentials,
  CalendarInfo,
  CalendarProvider,
  FreeBusyBlock,
  SyncEventParams,
} from "../interfaces/calendar-provider.interface";

export class GoogleAuthRevokedError extends Error {
  constructor(message = "Google authorization has been revoked or is invalid.") {
    super(message);
    this.name = "GoogleAuthRevokedError";
  }
}

export class GoogleApiError extends Error {
  public statusCode?: number;
  public details?: unknown;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = "GoogleApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

@Injectable()
export class GoogleCalendarProvider implements CalendarProvider {
  private readonly logger = new Logger("GoogleCalendarProvider");
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get<string>("GOOGLE_CLIENT_ID") || process.env.GOOGLE_CLIENT_ID || "";
    this.clientSecret =
      this.config.get<string>("GOOGLE_CLIENT_SECRET") || process.env.GOOGLE_CLIENT_SECRET || "";
    this.redirectUri =
      this.config.get<string>("GOOGLE_REDIRECT_URI") || process.env.GOOGLE_REDIRECT_URI || "";
  }

  /**
   * Exchanges an authorization code with PKCE code_verifier for access and refresh tokens.
   */
  async exchangeCode(
    code: string,
    codeVerifier: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds: number;
    accountEmail: string;
    scope: string;
  }> {
    const params = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      this.logger.error("Failed to exchange OAuth code with Google", tokenData);
      throw new GoogleApiError(
        tokenData.error_description || tokenData.error || "Failed to exchange authorization code",
        tokenRes.status,
        tokenData
      );
    }

    // Retrieve verified account email via userinfo endpoint using identity scope
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userinfo = (await userinfoRes.json()) as { email?: string; email_verified?: boolean };
    const email = userinfo.email || "";

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in || 3600,
      accountEmail: email,
      scope: tokenData.scope || "",
    };
  }

  /**
   * Refreshes an expired access token using the refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresInSeconds: number;
    refreshToken?: string;
  }> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !data.access_token) {
      if (data.error === "invalid_grant" || res.status === 400 || res.status === 401) {
        throw new GoogleAuthRevokedError(
          data.error_description || "Refresh token revoked or invalid grant."
        );
      }
      throw new GoogleApiError(
        data.error_description || data.error || "Failed to refresh access token",
        res.status,
        data
      );
    }

    return {
      accessToken: data.access_token,
      expiresInSeconds: data.expires_in || 3600,
      refreshToken: data.refresh_token,
    };
  }

  /**
   * Queries Google FreeBusy API for busy intervals and normalizes them to UTC Date intervals.
   */
  async getFreeBusy(
    credentials: CalendarCredentials,
    calendarIds: string[],
    startUtc: Date,
    endUtc: Date,
    options?: { abortSignal?: AbortSignal }
  ): Promise<FreeBusyBlock[]> {
    const url = "https://www.googleapis.com/calendar/v3/freeBusy";
    const body = {
      timeMin: startUtc.toISOString(),
      timeMax: endUtc.toISOString(),
      items: calendarIds.map((id) => ({ id })),
    };

    const res = await this.fetchWithAuth(url, credentials, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.abortSignal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new GoogleApiError("Google FreeBusy query failed", res.status, errBody);
    }

    const data = (await res.json()) as {
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
    };

    const blocks: FreeBusyBlock[] = [];
    if (data.calendars) {
      for (const calId of Object.keys(data.calendars)) {
        const calData = data.calendars[calId];
        if (calData?.busy) {
          for (const item of calData.busy) {
            const start = new Date(item.start);
            const end = new Date(item.end);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
              blocks.push({ start, end });
            }
          }
        }
      }
    }

    return blocks;
  }

  /**
   * Lists the host's Google Calendars and checks write permissions.
   */
  async listCalendars(credentials: CalendarCredentials): Promise<CalendarInfo[]> {
    const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
    const res = await this.fetchWithAuth(url, credentials);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new GoogleApiError("Failed to list Google calendars", res.status, errBody);
    }

    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        summary: string;
        primary?: boolean;
        accessRole: "owner" | "writer" | "writerWithoutPrivateAccess" | "reader" | "freeBusyReader";
      }>;
    };

    const items = data.items || [];
    return items.map((item) => {
      const isWritable =
        item.accessRole === "owner" ||
        item.accessRole === "writer" ||
        item.accessRole === "writerWithoutPrivateAccess";

      return {
        id: item.id,
        name: item.summary || item.id,
        isPrimary: Boolean(item.primary),
        accessRole: item.accessRole,
        writable: isWritable,
      };
    });
  }

  /**
   * Synchronizes a booking to the host's Google Calendar with deterministic ID and sendUpdates: 'none'.
   * Handles 409 Conflict crash recovery by checking extendedProperties.private.schedBookingId.
   */
  async syncEvent(
    credentials: CalendarCredentials,
    params: SyncEventParams
  ): Promise<{ externalEventId: string }> {
    const { calendarId, externalEventId, booking } = params;

    const eventPayload = {
      id: externalEventId,
      summary: `${booking.title} - ${booking.attendeeName}`,
      description: booking.description || `Meeting with ${booking.attendeeName} (${booking.attendeeEmail})`,
      location: booking.location || undefined,
      start: { dateTime: booking.startTime.toISOString() },
      end: { dateTime: booking.endTime.toISOString() },
      attendees: [
        {
          email: booking.attendeeEmail,
          displayName: booking.attendeeName,
          responseStatus: "accepted",
        },
      ],
      extendedProperties: {
        private: {
          schedBookingId: booking.id,
          schedSequence: String(booking.sequence),
        },
      },
    };

    // Attempt insert first
    const insertUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events?sendUpdates=none`;

    const insertRes = await this.fetchWithAuth(insertUrl, credentials, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload),
    });

    if (insertRes.ok) {
      return { externalEventId };
    }

    // If 409 Conflict: check if existing event belongs to this booking and patch it
    if (insertRes.status === 409) {
      this.logger.log(
        `Event ${externalEventId} already exists on calendar ${calendarId}. Verifying schedBookingId before patching...`
      );

      const getUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events/${encodeURIComponent(externalEventId)}`;

      const getRes = await this.fetchWithAuth(getUrl, credentials);
      if (getRes.ok) {
        const existingEvent = (await getRes.json()) as {
          extendedProperties?: { private?: { schedBookingId?: string } };
        };

        const existingBookingId = existingEvent.extendedProperties?.private?.schedBookingId;
        if (existingBookingId && existingBookingId !== booking.id) {
          throw new GoogleApiError(
            `Google Calendar event ${externalEventId} conflict: existing event belongs to different booking ${existingBookingId}`,
            409
          );
        }

        // Safe to patch
        const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          calendarId
        )}/events/${encodeURIComponent(externalEventId)}?sendUpdates=none`;

        const patchRes = await this.fetchWithAuth(patchUrl, credentials, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: eventPayload.summary,
            description: eventPayload.description,
            location: eventPayload.location,
            start: eventPayload.start,
            end: eventPayload.end,
            attendees: eventPayload.attendees,
            extendedProperties: eventPayload.extendedProperties,
          }),
        });

        if (patchRes.ok) {
          return { externalEventId };
        }

        const patchErr = await patchRes.json().catch(() => ({}));
        throw new GoogleApiError("Failed to patch existing Google event", patchRes.status, patchErr);
      }
    }

    const errBody = await insertRes.json().catch(() => ({}));
    throw new GoogleApiError("Failed to create Google Calendar event", insertRes.status, errBody);
  }

  /**
   * Deletes a Google Calendar event. Ignores 404 (already deleted).
   */
  async deleteEvent(
    credentials: CalendarCredentials,
    calendarId: string,
    externalEventId: string,
    sendUpdates: "none" = "none"
  ): Promise<void> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(externalEventId)}?sendUpdates=${sendUpdates}`;

    const res = await this.fetchWithAuth(url, credentials, {
      method: "DELETE",
    });

    if (res.ok || res.status === 404 || res.status === 410) {
      // 404/410 means event is already deleted on Google Calendar
      return;
    }

    const errBody = await res.json().catch(() => ({}));
    throw new GoogleApiError("Failed to delete Google Calendar event", res.status, errBody);
  }

  /**
   * Authenticated HTTP request wrapper.
   */
  private async fetchWithAuth(
    url: string,
    credentials: CalendarCredentials,
    init: RequestInit = {}
  ): Promise<Response> {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${credentials.accessToken}`);

    return fetch(url, {
      ...init,
      headers,
    });
  }
}
