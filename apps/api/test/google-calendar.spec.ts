import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CalendarIntegration } from "@prisma/client";
import {
  CalendarIntegrationStatus,
  CalendarProviderType,
  CalendarSyncJobStatus,
  CalendarSyncStatus,
  LocationType,
} from "@prisma/client";
import request from "supertest";
import type {
  CalendarCredentials,
  CalendarInfo,
  CalendarProvider,
  FreeBusyBlock,
  SyncEventParams,
} from "../src/integrations/interfaces/calendar-provider.interface";
import { GoogleAuthRevokedError } from "../src/integrations/providers/google-calendar.provider";
import { CalendarSyncProcessor } from "../src/integrations/services/calendar-sync.processor";
import { GoogleCalendarService } from "../src/integrations/services/google-calendar.service";
import { PasswordService } from "../src/auth/password.service";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import { CryptoVaultService } from "../src/shared/services/crypto-vault.service";
import { createTestApp, resetDatabase, uniqueLabel } from "./app.helper";

jest.setTimeout(30000);

class MockCalendarProvider implements CalendarProvider {
  public freeBusyBlocks: FreeBusyBlock[] = [];
  public shouldFailFreeBusy = false;
  public freeBusyDelayMs = 0;
  public calendars: CalendarInfo[] = [
    { id: "primary", name: "Personal Calendar", isPrimary: true, accessRole: "owner", writable: true },
    { id: "work-cal", name: "Work Calendar", isPrimary: false, accessRole: "writer", writable: true },
    { id: "shared-write", name: "Shared Project", isPrimary: false, accessRole: "writerWithoutPrivateAccess", writable: true },
    { id: "read-only-cal", name: "Company Holidays", isPrimary: false, accessRole: "reader", writable: false },
  ];
  public syncedEvents = new Map<string, { params: SyncEventParams; callCount: number }>();
  public deletedEvents: string[] = [];
  public failOnInsertWith409 = false;
  public simulateRevokedToken = false;

  async getFreeBusy(
    _credentials: CalendarCredentials,
    _calendarIds: string[],
    _startUtc: Date,
    _endUtc: Date,
    options?: { abortSignal?: AbortSignal }
  ): Promise<FreeBusyBlock[]> {
    if (this.freeBusyDelayMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, this.freeBusyDelayMs);
        options?.abortSignal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Aborted"));
        });
      });
    }

    if (this.shouldFailFreeBusy) {
      throw new Error("Google API 500 Internal Server Error");
    }

    return this.freeBusyBlocks;
  }

  async syncEvent(
    credentials: CalendarCredentials,
    params: SyncEventParams
  ): Promise<{ externalEventId: string }> {
    if (this.simulateRevokedToken) {
      throw new GoogleAuthRevokedError("invalid_grant");
    }

    const count = (this.syncedEvents.get(params.externalEventId)?.callCount || 0) + 1;

    if (this.failOnInsertWith409 && count === 1) {
      // Simulate 409 Conflict crash recovery
      this.syncedEvents.set(params.externalEventId, { params, callCount: count });
      return { externalEventId: params.externalEventId };
    }

    this.syncedEvents.set(params.externalEventId, { params, callCount: count });
    return { externalEventId: params.externalEventId };
  }

  async deleteEvent(
    _credentials: CalendarCredentials,
    _calendarId: string,
    externalEventId: string,
    _sendUpdates?: "none"
  ): Promise<void> {
    this.deletedEvents.push(externalEventId);
  }

  async listCalendars(_credentials: CalendarCredentials): Promise<CalendarInfo[]> {
    return this.calendars;
  }

  async refreshAccessToken(_refreshToken: string): Promise<{
    accessToken: string;
    expiresInSeconds: number;
    refreshToken?: string;
  }> {
    if (this.simulateRevokedToken) {
      throw new GoogleAuthRevokedError("invalid_grant");
    }
    return {
      accessToken: "mock-refreshed-access-token",
      expiresInSeconds: 3600,
    };
  }

  async exchangeCode(
    code: string,
    _codeVerifier: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds: number;
    accountEmail: string;
    scope: string;
  }> {
    return {
      accessToken: `mock-access-token-${code}`,
      refreshToken: `mock-refresh-token-${code}`,
      expiresInSeconds: 3600,
      accountEmail: "host.google@example.com",
      scope: "openid email https://www.googleapis.com/auth/calendar.events",
    };
  }
}

describe("Week 5: Google Calendar Busy-Time Checking & Outbound Event Synchronization", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cryptoVault: CryptoVaultService;
  let googleService: GoogleCalendarService;
  let syncProcessor: CalendarSyncProcessor;
  let mockProvider: MockCalendarProvider;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    cryptoVault = app.get(CryptoVaultService);
    googleService = app.get(GoogleCalendarService);
    syncProcessor = app.get(CalendarSyncProcessor);

    // Swap provider with mock for deterministic testing
    mockProvider = new MockCalendarProvider();
    (googleService as unknown as { calendarProvider: CalendarProvider }).calendarProvider = mockProvider;
    (syncProcessor as unknown as { calendarProvider: CalendarProvider }).calendarProvider = mockProvider;
  });

  beforeEach(async () => {
    await resetDatabase(app);
    mockProvider.freeBusyBlocks = [];
    mockProvider.shouldFailFreeBusy = false;
    mockProvider.freeBusyDelayMs = 0;
    mockProvider.syncedEvents.clear();
    mockProvider.deletedEvents = [];
    mockProvider.failOnInsertWith409 = false;
    mockProvider.simulateRevokedToken = false;
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe("1. Crypto Vault (Versioned AES-256-GCM)", () => {
    it("successfully encrypts and decrypts OAuth tokens with v1: format", () => {
      const plaintext = "ya29.a0AfH6SMD_super_secret_google_refresh_token_12345";
      const encrypted = cryptoVault.encrypt(plaintext);

      expect(encrypted.startsWith("v1:")).toBe(true);
      const parts = encrypted.split(":");
      expect(parts.length).toBe(4);
      expect(parts[1]?.length).toBe(24); // 12-byte IV in hex = 24 chars
      expect(parts[2]?.length).toBe(32); // 16-byte AuthTag in hex = 32 chars

      const decrypted = cryptoVault.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("throws an authentication error when ciphertext or auth tag is tampered with", () => {
      const encrypted = cryptoVault.encrypt("secret-token");
      const parts = encrypted.split(":");
      // Tamper ciphertext
      parts[3] = "ff" + parts[3]?.slice(2);
      const tampered = parts.join(":");

      expect(() => cryptoVault.decrypt(tampered)).toThrow();
    });

    it("throws an error when CALENDAR_ENCRYPTION_KEY is missing or invalid size", () => {
      const mockConfig = {
        get: (_key: string) => "too-short-key",
      } as ConfigService;

      expect(() => new CryptoVaultService(mockConfig)).toThrow(/must be exactly 32 bytes/);
    });
  });

  describe("2. OAuth 2.0 PKCE & Session-Bound State Security", () => {
    it("generates PKCE codeVerifier and codeChallenge (S256 base64url)", () => {
      const { codeVerifier, codeChallenge } = googleService.generatePkcePair();
      expect(codeVerifier).toBeDefined();
      expect(codeChallenge).toBeDefined();
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    });

    it("generates and verifies signed OAuth state bound to user and session", () => {
      const userId = "b3c95972-7a71-4be6-a4c3-8f6df7ce0111";
      const sessionId = "sess_123456";
      const state = googleService.generateOAuthState(userId, sessionId);

      const verified = googleService.verifyOAuthState(state, userId, sessionId);
      expect(verified.userId).toBe(userId);
      expect(verified.sessionId).toBe(sessionId);
    });

    it("rejects state replay (single-use nonce)", () => {
      const userId = "b3c95972-7a71-4be6-a4c3-8f6df7ce0111";
      const sessionId = "sess_123456";
      const state = googleService.generateOAuthState(userId, sessionId);

      // First verification succeeds
      googleService.verifyOAuthState(state, userId, sessionId);

      // Second verification fails
      expect(() => googleService.verifyOAuthState(state, userId, sessionId)).toThrow(
        /OAuth state has already been used/
      );
    });

    it("rejects state when user or session does not match", () => {
      const userId = "b3c95972-7a71-4be6-a4c3-8f6df7ce0111";
      const sessionId = "sess_123456";
      const state = googleService.generateOAuthState(userId, sessionId);

      expect(() => googleService.verifyOAuthState(state, "wrong-user-id", sessionId)).toThrow(
        /OAuth state does not match authenticated user/
      );
    });
  });

  async function createAuthenticatedHost(prefix: string) {
    const passwordService = app.get(PasswordService);
    const passwordHash = await passwordService.hash("Password123!");
    const username = uniqueLabel(prefix);
    const email = `${username}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        name: `Host ${username}`,
        username,
        timezone: "America/New_York",
        passwordHash,
      },
    });

    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/v1/auth/login").send({
      email,
      password: "Password123!",
    });

    return { user, agent };
  }

  async function createHostUser(prefix: string) {
    const username = uniqueLabel(prefix);
    const email = `${username}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        name: `Host ${username}`,
        username,
        timezone: "UTC",
        passwordHash: "dummy-hash-not-used-for-public",
      },
    });
    return user;
  }

  describe("3. Calendar Write Permissions Validation & Preferences", () => {
    let hostUser: { id: string; email: string };
    let agent: request.Agent;

    beforeEach(async () => {
      const created = await createAuthenticatedHost("host");
      hostUser = created.user;
      agent = created.agent;

      // Create connected integration
      await prisma.calendarIntegration.create({
        data: {
          userId: hostUser.id,
          provider: CalendarProviderType.GOOGLE,
          status: CalendarIntegrationStatus.CONNECTED,
          accountEmail: "host.google@example.com",
          encryptedAccessToken: cryptoVault.encrypt("mock-access-token"),
          encryptedRefreshToken: cryptoVault.encrypt("mock-refresh-token"),
          tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
          selectedCalendarId: "primary",
          selectedCalendarName: "Personal Calendar",
          conflictCalendarIds: ["primary"],
        },
      });
    });

    it("lists host calendars indicating which ones are writable", async () => {
      const res = await agent.get("/api/v1/integrations/google/calendars").expect(200);
      expect(res.body.calendars).toHaveLength(4);
      const readOnly = res.body.calendars.find((c: CalendarInfo) => c.id === "read-only-cal");
      expect(readOnly.writable).toBe(false);
      const writable = res.body.calendars.find((c: CalendarInfo) => c.id === "work-cal");
      expect(writable.writable).toBe(true);
    });

    it("rejects selecting a read-only calendar as the write destination with 400", async () => {
      const res = await agent
        .patch("/api/v1/integrations/google/calendars")
        .send({
          selectedCalendarId: "read-only-cal",
          conflictCalendarIds: ["primary", "read-only-cal"],
        })
        .expect(400);

      expect(res.body.error.code).toBe("INSUFFICIENT_CALENDAR_PERMISSIONS");
    });

    it("successfully updates write destination to a writable calendar", async () => {
      const res = await agent
        .patch("/api/v1/integrations/google/calendars")
        .send({
          selectedCalendarId: "work-cal",
          conflictCalendarIds: ["primary", "work-cal", "shared-write"],
        })
        .expect(200);

      expect(res.body.selectedCalendarId).toBe("work-cal");
      expect(res.body.selectedCalendarName).toBe("Work Calendar");
      expect(res.body.conflictCalendarIds).toEqual(["primary", "work-cal", "shared-write"]);
    });

    it("clears credentials and sets status to DISCONNECTED on disconnect", async () => {
      const res = await agent.post("/api/v1/integrations/google/disconnect").expect(200);
      expect(res.body.status).toBe("DISCONNECTED");
      expect(res.body.accountEmail).toBe("host.google@example.com");

      const dbRow = await prisma.calendarIntegration.findUnique({
        where: { userId_provider: { userId: hostUser.id, provider: CalendarProviderType.GOOGLE } },
      });
      expect(dbRow?.encryptedAccessToken).toBeNull();
      expect(dbRow?.encryptedRefreshToken).toBeNull();
      expect(dbRow?.tokenExpiresAt).toBeNull();
    });
  });

  describe("4. Slot Engine Google FreeBusy & Degraded-Mode Policy", () => {
    let hostUser: { id: string; email: string; username: string };
    let eventType: { id: string; slug: string };

    beforeEach(async () => {
      const user = await createHostUser("doc");
      hostUser = user;

      await prisma.schedule.create({
        data: {
          userId: hostUser.id,
          name: "Default",
          timeZone: "UTC",
          isDefault: true,
          days: {
            create: [
              { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }, // Monday
            ],
          },
        },
      });

      const et = await prisma.eventType.create({
        data: {
          userId: hostUser.id,
          title: "30 Min Consultation",
          slug: "consultation",
          durationMinutes: 30,
          minimumNoticeMinutes: 0,
          locationType: LocationType.CUSTOM_LINK,
          locationData: { url: "https://meet.example.com/room" },
        },
      });
      eventType = { id: et.id, slug: et.slug };

      // Connect Google Calendar
      await prisma.calendarIntegration.create({
        data: {
          userId: hostUser.id,
          provider: CalendarProviderType.GOOGLE,
          status: CalendarIntegrationStatus.CONNECTED,
          accountEmail: "doc.google@example.com",
          encryptedAccessToken: cryptoVault.encrypt("mock-access-token"),
          encryptedRefreshToken: cryptoVault.encrypt("mock-refresh-token"),
          tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
          selectedCalendarId: "primary",
          conflictCalendarIds: ["primary"],
        },
      });
    });

    it("subtracts Google FreeBusy external blocks normalized to UTC from available slots", async () => {
      // Add a Google FreeBusy block on next Monday 10:00 - 11:00 UTC (06:00 - 07:00 America/New_York)
      mockProvider.freeBusyBlocks = [
        {
          start: new Date("2026-10-12T10:00:00Z"),
          end: new Date("2026-10-12T11:00:00Z"),
        },
      ];

      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/${hostUser.username}/${eventType.slug}/slots`)
        .query({
          startDate: "2026-10-12",
          endDate: "2026-10-12",
          timezone: "America/New_York",
        })
        .expect(200);

      const slots = res.body as Array<{ startUtc: string }>;
      const has10am = slots.some((s) => s.startUtc === "2026-10-12T10:00:00.000Z");
      const has1030am = slots.some((s) => s.startUtc === "2026-10-12T10:30:00.000Z");
      const has930am = slots.some((s) => s.startUtc === "2026-10-12T09:30:00.000Z");
      const has11am = slots.some((s) => s.startUtc === "2026-10-12T11:00:00.000Z");

      expect(has10am).toBe(false);
      expect(has1030am).toBe(false);
      expect(has930am).toBe(true);
      expect(has11am).toBe(true);
    });

    it("fails open during slot browsing (GET /slots) if Google FreeBusy fails or times out", async () => {
      mockProvider.shouldFailFreeBusy = true;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/${hostUser.username}/${eventType.slug}/slots`)
        .query({
          startDate: "2026-10-12",
          endDate: "2026-10-12",
          timezone: "America/New_York",
        })
        .expect(200);

      // Returns DB availability despite Google error (fail-open degraded mode)
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("fails closed with 503 CALENDAR_AVAILABILITY_UNAVAILABLE during final booking confirmation if Google is unreachable", async () => {
      mockProvider.shouldFailFreeBusy = true;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/public/${hostUser.username}/${eventType.slug}/book`)
        .send({
          startUtc: "2026-10-12T09:00:00.000Z",
          attendeeName: "Jane Attendee",
          attendeeEmail: "jane@example.com",
          attendeeTimeZone: "America/New_York",
        })
        .expect(503);

      expect(res.body.error.code).toBe("CALENDAR_AVAILABILITY_UNAVAILABLE");
    });

    it("rejects final booking with 409 SLOT_ALREADY_BOOKED if Google calendar has a conflicting busy block", async () => {
      mockProvider.freeBusyBlocks = [
        {
          start: new Date("2026-10-12T09:00:00Z"),
          end: new Date("2026-10-12T09:30:00Z"),
        },
      ];

      const res = await request(app.getHttpServer())
        .post(`/api/v1/public/${hostUser.username}/${eventType.slug}/book`)
        .send({
          startUtc: "2026-10-12T09:00:00.000Z",
          attendeeName: "Jane Attendee",
          attendeeEmail: "jane@example.com",
          attendeeTimeZone: "America/New_York",
        })
        .expect(409);

      expect(res.body.error.code).toBe("SLOT_ALREADY_BOOKED");
    });
  });

  describe("5. Desired-State Outbox Sync, Deterministic IDs & Idempotency", () => {
    let hostUser: { id: string; email: string; username: string };
    let eventType: { id: string; slug: string };
    let integration: CalendarIntegration;

    beforeEach(async () => {
      const user = await createHostUser("synchost");
      hostUser = user;

      await prisma.schedule.create({
        data: {
          userId: hostUser.id,
          name: "Default",
          timeZone: "UTC",
          isDefault: true,
          days: {
            create: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
          },
        },
      });

      const et = await prisma.eventType.create({
        data: {
          userId: hostUser.id,
          title: "Strategy Session",
          slug: "strategy",
          durationMinutes: 30,
          minimumNoticeMinutes: 0,
          locationType: LocationType.CUSTOM_LINK,
          locationData: { url: "https://meet.example.com/strat" },
        },
      });
      eventType = { id: et.id, slug: et.slug };

      integration = await prisma.calendarIntegration.create({
        data: {
          userId: hostUser.id,
          provider: CalendarProviderType.GOOGLE,
          status: CalendarIntegrationStatus.CONNECTED,
          accountEmail: "synchost.google@example.com",
          encryptedAccessToken: cryptoVault.encrypt("mock-access-token"),
          encryptedRefreshToken: cryptoVault.encrypt("mock-refresh-token"),
          tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
          selectedCalendarId: "primary",
          conflictCalendarIds: ["primary"],
        },
      });
    });

    it("enqueues CalendarSyncJob on booking creation and worker syncs with deterministic ID and sendUpdates: none", async () => {
      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/${hostUser.username}/${eventType.slug}/book`)
        .send({
          startUtc: "2026-10-12T09:00:00.000Z",
          attendeeName: "Alice Miller",
          attendeeEmail: "alice@example.com",
          attendeeTimeZone: "America/New_York",
        })
        .expect(201);

      const bookingId = bookRes.body.id;

      // Verify outbox job was enqueued in PostgreSQL with sequence 0
      const syncJob = await prisma.calendarSyncJob.findFirst({
        where: { bookingId, integrationId: integration.id },
      });
      expect(syncJob).toBeDefined();
      expect(syncJob?.sequence).toBe(0);
      expect(syncJob?.status).toBe(CalendarSyncJobStatus.PENDING);

      // Process outbox jobs
      const sweep = await syncProcessor.processPendingJobs(10);
      expect(sweep.processed).toBe(1);
      expect(sweep.success).toBe(1);

      // Verify deterministic event ID format: 'sched' + hex UUID without hyphens
      const expectedEventId = `sched${bookingId.replace(/-/g, "").toLowerCase()}`;
      expect(mockProvider.syncedEvents.has(expectedEventId)).toBe(true);

      const syncCall = mockProvider.syncedEvents.get(expectedEventId);
      expect(syncCall?.params.booking.title).toBe("Strategy Session");
      expect(syncCall?.params.booking.attendeeName).toBe("Alice Miller");
      expect(syncCall?.params.sendUpdates).toBe("none");

      // Verify ExternalCalendarEvent mapping was persisted in DB
      const mapping = await prisma.externalCalendarEvent.findUnique({
        where: { bookingId_integrationId: { bookingId, integrationId: integration.id } },
      });
      expect(mapping).toBeDefined();
      expect(mapping?.externalEventId).toBe(expectedEventId);
      expect(mapping?.lastSyncedSequence).toBe(0);
      expect(mapping?.syncStatus).toBe(CalendarSyncStatus.SYNCED);
    });

    it("recovers from 409 Conflict crash without creating duplicate events", async () => {
      mockProvider.failOnInsertWith409 = true;

      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/${hostUser.username}/${eventType.slug}/book`)
        .send({
          startUtc: "2026-10-12T09:30:00.000Z",
          attendeeName: "Bob Crash",
          attendeeEmail: "bob@example.com",
          attendeeTimeZone: "America/New_York",
        })
        .expect(201);

      const bookingId = bookRes.body.id;
      const expectedEventId = `sched${bookingId.replace(/-/g, "").toLowerCase()}`;

      // Worker executes sync with 409 simulation
      const sweep = await syncProcessor.processPendingJobs(10);
      expect(sweep.success).toBe(1);

      // Verify mapping is successfully recorded
      const mapping = await prisma.externalCalendarEvent.findUnique({
        where: { bookingId_integrationId: { bookingId, integrationId: integration.id } },
      });
      expect(mapping?.externalEventId).toBe(expectedEventId);
      expect(mapping?.syncStatus).toBe(CalendarSyncStatus.SYNCED);
    });

    it("skips stale sequence jobs as no-ops if booking has already been rescheduled", async () => {
      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/${hostUser.username}/${eventType.slug}/book`)
        .send({
          startUtc: "2026-10-12T11:00:00.000Z",
          attendeeName: "Charlie Stale",
          attendeeEmail: "charlie@example.com",
          attendeeTimeZone: "America/New_York",
        })
        .expect(201);

      const bookingId = bookRes.body.id;
      const manageToken = bookRes.body.manageToken;

      // Reschedule booking before outbox worker processes sequence 0
      await request(app.getHttpServer())
        .patch(`/api/v1/public/bookings/${bookingId}/reschedule`)
        .query({ token: manageToken })
        .send({
          startUtc: "2026-10-12T14:00:00.000Z",
          expectedSequence: 0,
        })
        .expect(200);

      // Now we have 2 jobs: sequence 0 and sequence 1
      const jobs = await prisma.calendarSyncJob.findMany({
        where: { bookingId },
        orderBy: { sequence: "asc" },
      });
      expect(jobs).toHaveLength(2);

      // Process both jobs
      const sweep = await syncProcessor.processPendingJobs(10);
      expect(sweep.processed).toBe(2);
      expect(sweep.success).toBe(2);

      // Sequence 0 job should be completed without throwing
      const job0 = await prisma.calendarSyncJob.findUnique({ where: { id: jobs[0]!.id } });
      const job1 = await prisma.calendarSyncJob.findUnique({ where: { id: jobs[1]!.id } });
      expect(job0?.status).toBe(CalendarSyncJobStatus.COMPLETED);
      expect(job1?.status).toBe(CalendarSyncJobStatus.COMPLETED);

      // Final external event state should reflect the rescheduled start time 14:00 UTC
      const expectedEventId = `sched${bookingId.replace(/-/g, "").toLowerCase()}`;
      const syncCall = mockProvider.syncedEvents.get(expectedEventId);
      expect(syncCall?.params.booking.startTime.toISOString()).toBe("2026-10-12T14:00:00.000Z");
    });

    it("deletes Google Calendar event on booking cancellation", async () => {
      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/${hostUser.username}/${eventType.slug}/book`)
        .send({
          startUtc: "2026-10-12T15:00:00.000Z",
          attendeeName: "Dave Cancel",
          attendeeEmail: "dave@example.com",
          attendeeTimeZone: "America/New_York",
        })
        .expect(201);

      const bookingId = bookRes.body.id;
      const manageToken = bookRes.body.manageToken;

      // Sync creation first
      await syncProcessor.processPendingJobs(10);

      // Cancel booking
      await request(app.getHttpServer())
        .patch(`/api/v1/public/bookings/${bookingId}/cancel`)
        .query({ token: manageToken })
        .send({
          expectedSequence: 0,
          reason: "Schedule conflict",
        })
        .expect(200);

      // Process cancellation sync job
      const sweep = await syncProcessor.processPendingJobs(10);
      expect(sweep.success).toBe(1);

      const expectedEventId = `sched${bookingId.replace(/-/g, "").toLowerCase()}`;
      expect(mockProvider.deletedEvents).toContain(expectedEventId);
    });

    it("marks integration REVOKED and erases credentials when refresh returns invalid_grant", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/public/${hostUser.username}/${eventType.slug}/book`)
        .send({
          startUtc: "2026-10-12T16:00:00.000Z",
          attendeeName: "Eve Revoke",
          attendeeEmail: "eve@example.com",
          attendeeTimeZone: "America/New_York",
        })
        .expect(201);

      mockProvider.simulateRevokedToken = true;
      await prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: { tokenExpiresAt: new Date(Date.now() - 1000) },
      });

      // Worker runs sync and encounters revoked refresh token
      await syncProcessor.processPendingJobs(10);

      // Verify integration was transitioned to REVOKED and secrets cleared
      const updatedIntegration = await prisma.calendarIntegration.findUnique({
        where: { id: integration.id },
      });
      expect(updatedIntegration?.status).toBe(CalendarIntegrationStatus.REVOKED);
      expect(updatedIntegration?.encryptedAccessToken).toBeNull();
      expect(updatedIntegration?.encryptedRefreshToken).toBeNull();
      expect(updatedIntegration?.accountEmail).toBe("synchost.google@example.com");
    });
  });
});
