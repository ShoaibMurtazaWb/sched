import type { INestApplication } from "@nestjs/common";
import { ZoomIntegrationStatus } from "@prisma/client";
import request from "supertest";
import { ZoomService } from "../src/integrations/services/zoom.service";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import { CryptoVaultService } from "../src/shared/services/crypto-vault.service";
import { createTestApp, resetDatabase, uniqueLabel } from "./app.helper";

describe("Zoom Meeting Creation Flow in Bookings", () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let zoomService: ZoomService;
  let cryptoVault: CryptoVaultService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    zoomService = app.get(ZoomService);
    cryptoVault = app.get(CryptoVaultService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    jest.restoreAllMocks();
  });

  async function setupHost(username: string) {
    const registerRes = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: `${username}@example.com`,
      password: "password-10",
      name: `Host ${username}`,
      username,
      timezone: "Asia/Karachi",
    });
    expect(registerRes.status).toBe(201);
    const cookies = registerRes.headers["set-cookie"] as unknown as string[];
    const user = registerRes.body as { id: string; username: string };
    return { cookies, user, username };
  }

  function getNextWeekdayDateStr(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().slice(0, 10);
  }

  async function connectZoom(userId: string) {
    return prisma.zoomIntegration.upsert({
      where: { userId },
      create: {
        userId,
        status: ZoomIntegrationStatus.CONNECTED,
        accountEmail: "host@example.com",
        zoomUserId: "zoom-user-123",
        encryptedAccessToken: cryptoVault.encrypt("test-zoom-access-token"),
        encryptedRefreshToken: cryptoVault.encrypt("test-zoom-refresh-token"),
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
      update: {
        status: ZoomIntegrationStatus.CONNECTED,
        accountEmail: "host@example.com",
        zoomUserId: "zoom-user-123",
        encryptedAccessToken: cryptoVault.encrypt("test-zoom-access-token"),
        encryptedRefreshToken: cryptoVault.encrypt("test-zoom-refresh-token"),
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
  }

  it("1. Successfully creates dynamic Zoom meeting on Zoom event type booking and stores joinUrl", async () => {
    const host = await setupHost(uniqueLabel("zoom-host-1"));
    await connectZoom(host.user.id);

    // Spy on ZoomService
    const createMeetingSpy = jest.spyOn(zoomService, "createMeeting").mockResolvedValue({
      meetingId: "9876543210",
      joinUrl: "https://us05web.zoom.us/j/9876543210?pwd=xyz",
      startUrl: "https://us05web.zoom.us/s/9876543210?zak=secret",
      password: "xyz",
    });

    // Create Zoom Event Type
    const evRes = await request(app.getHttpServer())
      .post("/api/v1/event-types")
      .set("Cookie", host.cookies)
      .send({
        title: "Zoom Consultation",
        slug: "zoom-consultation",
        durationMinutes: 30,
        location: {
          type: "ZOOM",
          data: { extraNotes: "Please bring questions" },
        },
      });
    expect(evRes.status).toBe(201);

    const dateStr = getNextWeekdayDateStr();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/v1/public/${host.username}/zoom-consultation/slots`)
      .query({ startDate: dateStr, endDate: dateStr, timezone: "Asia/Karachi" });
    expect(slotsRes.status).toBe(200);
    expect(slotsRes.body.length).toBeGreaterThan(0);
    const slot = slotsRes.body[0];

    // Book the slot
    const bookRes = await request(app.getHttpServer())
      .post(`/api/v1/public/${host.username}/zoom-consultation/book`)
      .send({
        startUtc: slot.startUtc,
        attendeeName: "Bob Attendee",
        attendeeEmail: "bob@example.com",
        attendeeTimeZone: "Asia/Karachi",
      });

    expect(bookRes.status).toBe(201);
    expect(createMeetingSpy).toHaveBeenCalledTimes(1);
    expect(createMeetingSpy).toHaveBeenCalledWith(
      host.user.id,
      expect.objectContaining({
        topic: expect.stringContaining("Zoom Consultation"),
        durationMinutes: 30,
        timezone: "Asia/Karachi",
      })
    );

    // Verify response contains Zoom join details
    expect(bookRes.body.location.type).toBe("ZOOM");
    expect(bookRes.body.location.data.joinUrl).toBe("https://us05web.zoom.us/j/9876543210?pwd=xyz");
    expect(bookRes.body.location.data.meetingId).toBe("9876543210");
    // Verify startUrl is NOT exposed in response
    expect(bookRes.body.location.data.startUrl).toBeUndefined();

    // Verify confirmation endpoint also returns join URL without startUrl
    const manageToken = bookRes.body.manageToken;
    const confirmRes = await request(app.getHttpServer())
      .get(`/api/v1/public/bookings/${bookRes.body.id}`)
      .set("x-booking-token", manageToken);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.location.data.joinUrl).toBe("https://us05web.zoom.us/j/9876543210?pwd=xyz");
    expect(confirmRes.body.location.data.startUrl).toBeUndefined();
  });

  it("2. Does NOT create Zoom meeting for non-Zoom event types", async () => {
    const host = await setupHost(uniqueLabel("nozoom-host"));
    const createMeetingSpy = jest.spyOn(zoomService, "createMeeting");

    // Create IN_PERSON Event Type
    const evRes = await request(app.getHttpServer())
      .post("/api/v1/event-types")
      .set("Cookie", host.cookies)
      .send({
        title: "Coffee Chat",
        slug: "coffee-chat",
        durationMinutes: 30,
        location: {
          type: "IN_PERSON",
          data: { address: "123 Coffee St, City" },
        },
      });
    expect(evRes.status).toBe(201);

    const dateStr = getNextWeekdayDateStr();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/v1/public/${host.username}/coffee-chat/slots`)
      .query({ startDate: dateStr, endDate: dateStr, timezone: "Asia/Karachi" });
    const slot = slotsRes.body[0];

    const bookRes = await request(app.getHttpServer())
      .post(`/api/v1/public/${host.username}/coffee-chat/book`)
      .send({
        startUtc: slot.startUtc,
        attendeeName: "Alice Attendee",
        attendeeEmail: "alice@example.com",
        attendeeTimeZone: "Asia/Karachi",
      });

    expect(bookRes.status).toBe(201);
    expect(createMeetingSpy).not.toHaveBeenCalled();
    expect(bookRes.body.location.type).toBe("IN_PERSON");
  });

  it("3. Fails booking creation if host has not connected Zoom", async () => {
    const host = await setupHost(uniqueLabel("unconnected-host"));

    // Seed Zoom event type directly (as if legacy or disconnected after creation)
    const ev = await prisma.eventType.create({
      data: {
        userId: host.user.id,
        title: "Disconnected Zoom Meeting",
        slug: "disc-zoom",
        durationMinutes: 30,
        locationType: "ZOOM",
      },
    });

    const dateStr = getNextWeekdayDateStr();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/v1/public/${host.username}/disc-zoom/slots`)
      .query({ startDate: dateStr, endDate: dateStr, timezone: "Asia/Karachi" });
    const slot = slotsRes.body[0];

    const bookRes = await request(app.getHttpServer())
      .post(`/api/v1/public/${host.username}/disc-zoom/book`)
      .send({
        startUtc: slot.startUtc,
        attendeeName: "Charlie Attendee",
        attendeeEmail: "charlie@example.com",
        attendeeTimeZone: "Asia/Karachi",
      });

    expect(bookRes.status).toBe(400);
    expect(bookRes.body.error.code).toBe("ZOOM_NOT_CONNECTED");
  });

  it("4. Fails booking creation and cleans up if Zoom API fails (no orphaned or corrupted booking)", async () => {
    const host = await setupHost(uniqueLabel("failing-zoom-host"));
    await connectZoom(host.user.id);

    jest.spyOn(zoomService, "createMeeting").mockRejectedValue(new Error("Zoom API Rate Limit Exceeded"));

    const ev = await prisma.eventType.create({
      data: {
        userId: host.user.id,
        title: "Failing Zoom",
        slug: "failing-zoom",
        durationMinutes: 30,
        locationType: "ZOOM",
      },
    });

    const dateStr = getNextWeekdayDateStr();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/v1/public/${host.username}/failing-zoom/slots`)
      .query({ startDate: dateStr, endDate: dateStr, timezone: "Asia/Karachi" });
    const slot = slotsRes.body[0];

    const bookRes = await request(app.getHttpServer())
      .post(`/api/v1/public/${host.username}/failing-zoom/book`)
      .send({
        startUtc: slot.startUtc,
        attendeeName: "David Attendee",
        attendeeEmail: "david@example.com",
        attendeeTimeZone: "Asia/Karachi",
      });

    expect(bookRes.status).toBeGreaterThanOrEqual(400);

    // Verify NO booking was persisted in database
    const bookingCount = await prisma.booking.count({
      where: { hostId: host.user.id },
    });
    expect(bookingCount).toBe(0);
  });

  it("5. Retrying the same booking request returns 409 BOOKING_ALREADY_EXISTS and does not create a duplicate Zoom meeting", async () => {
    const host = await setupHost(uniqueLabel("retry-host"));
    await connectZoom(host.user.id);

    const createMeetingSpy = jest.spyOn(zoomService, "createMeeting").mockResolvedValue({
      meetingId: "1112223334",
      joinUrl: "https://zoom.us/j/1112223334",
      startUrl: "https://zoom.us/s/1112223334",
    });

    const ev = await prisma.eventType.create({
      data: {
        userId: host.user.id,
        title: "Repeat Booking",
        slug: "repeat-booking",
        durationMinutes: 30,
        locationType: "ZOOM",
      },
    });

    const dateStr = getNextWeekdayDateStr();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/v1/public/${host.username}/repeat-booking/slots`)
      .query({ startDate: dateStr, endDate: dateStr, timezone: "Asia/Karachi" });
    const slot = slotsRes.body[0];

    // First booking attempt -> Success
    const firstRes = await request(app.getHttpServer())
      .post(`/api/v1/public/${host.username}/repeat-booking/book`)
      .send({
        startUtc: slot.startUtc,
        attendeeName: "Emma Attendee",
        attendeeEmail: "emma@example.com",
        attendeeTimeZone: "Asia/Karachi",
      });
    expect(firstRes.status).toBe(201);
    expect(createMeetingSpy).toHaveBeenCalledTimes(1);

    // Second booking attempt with same slot & attendee -> Blocked as duplicate
    const secondRes = await request(app.getHttpServer())
      .post(`/api/v1/public/${host.username}/repeat-booking/book`)
      .send({
        startUtc: slot.startUtc,
        attendeeName: "Emma Attendee",
        attendeeEmail: "emma@example.com",
        attendeeTimeZone: "Asia/Karachi",
      });
    expect(secondRes.status).toBe(409);
    expect(secondRes.body.error.code).toBe("BOOKING_ALREADY_EXISTS");

    // Must NOT have called createMeeting a second time
    expect(createMeetingSpy).toHaveBeenCalledTimes(1);
  });

  it("6. Rescheduling updates Zoom meeting and Cancellation deletes Zoom meeting", async () => {
    const host = await setupHost(uniqueLabel("lifecycle-host"));
    await connectZoom(host.user.id);

    jest.spyOn(zoomService, "createMeeting").mockResolvedValue({
      meetingId: "5556667778",
      joinUrl: "https://zoom.us/j/5556667778",
      startUrl: "https://zoom.us/s/5556667778",
    });

    const updateMeetingSpy = jest.spyOn(zoomService, "updateMeeting").mockResolvedValue();
    const deleteMeetingSpy = jest.spyOn(zoomService, "deleteMeeting").mockResolvedValue();

    const ev = await prisma.eventType.create({
      data: {
        userId: host.user.id,
        title: "Lifecycle Event",
        slug: "lifecycle-event",
        durationMinutes: 30,
        locationType: "ZOOM",
      },
    });

    const dateStr = getNextWeekdayDateStr();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/v1/public/${host.username}/lifecycle-event/slots`)
      .query({ startDate: dateStr, endDate: dateStr, timezone: "Asia/Karachi" });
    const slot1 = slotsRes.body[0];
    const slot2 = slotsRes.body[1];

    // Create booking
    const bookRes = await request(app.getHttpServer())
      .post(`/api/v1/public/${host.username}/lifecycle-event/book`)
      .send({
        startUtc: slot1.startUtc,
        attendeeName: "Frank Attendee",
        attendeeEmail: "frank@example.com",
        attendeeTimeZone: "Asia/Karachi",
      });
    expect(bookRes.status).toBe(201);
    const bookingId = bookRes.body.id;
    const manageToken = bookRes.body.manageToken;

    // Reschedule booking
    const reschedRes = await request(app.getHttpServer())
      .patch(`/api/v1/public/bookings/${bookingId}/reschedule`)
      .set("x-booking-token", manageToken)
      .send({
        startUtc: slot2.startUtc,
        expectedSequence: 0,
        reason: "Need another time",
      });
    expect(reschedRes.status).toBe(200);
    expect(updateMeetingSpy).toHaveBeenCalledWith(
      host.user.id,
      "5556667778",
      expect.objectContaining({
        durationMinutes: 30,
      })
    );

    // Cancel booking
    const cancelRes = await request(app.getHttpServer())
      .patch(`/api/v1/public/bookings/${bookingId}/cancel`)
      .set("x-booking-token", manageToken)
      .send({
        expectedSequence: 1,
        reason: "Cannot make it",
      });
    expect(cancelRes.status).toBe(200);
    expect(deleteMeetingSpy).toHaveBeenCalledWith(host.user.id, "5556667778");
  });
});
