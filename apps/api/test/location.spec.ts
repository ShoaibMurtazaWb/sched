import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, resetDatabase, uniqueLabel } from "./app.helper";
import { PrismaService } from "../src/shared/prisma/prisma.service";

describe("Milestone 3: Meeting Location & Conferencing Domain", () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function setupHost(username: string) {
    const registerRes = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: `${username}@example.com`,
      password: "password-10",
      name: `Host ${username}`,
      username,
      timezone: "America/New_York",
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

  describe("1. Location Configuration Validation on Event Types", () => {
    it("creates event types for all 5 valid location types", async () => {
      const host = await setupHost(uniqueLabel("loc-host"));

      // 1. IN_PERSON
      const inPersonRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "In Person Coffee",
          slug: "in-person-coffee",
          durationMinutes: 30,
          location: {
            type: "IN_PERSON",
            data: {
              address: "100 Market St, San Francisco, CA",
              displayPublicAddress: true,
              extraNotes: "Meet at the main lobby",
            },
          },
        });
      expect(inPersonRes.status).toBe(201);
      expect(inPersonRes.body.location.type).toBe("IN_PERSON");
      expect(inPersonRes.body.location.data.address).toBe("100 Market St, San Francisco, CA");

      // 2. STATIC_VIDEO
      const videoRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Zoom Discovery",
          slug: "zoom-discovery",
          durationMinutes: 30,
          location: {
            type: "STATIC_VIDEO",
            data: {
              url: "https://zoom.us/j/1234567890",
              extraNotes: "Passcode: 9876",
            },
          },
        });
      expect(videoRes.status).toBe(201);
      expect(videoRes.body.location.type).toBe("STATIC_VIDEO");

      // 3. CUSTOM_LINK
      const customRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Custom Room",
          slug: "custom-room",
          durationMinutes: 30,
          location: {
            type: "CUSTOM_LINK",
            data: {
              url: "https://meet.customcorp.internal/room-42",
            },
          },
        });
      expect(customRes.status).toBe(201);
      expect(customRes.body.location.type).toBe("CUSTOM_LINK");

      // 4. HOST_CALLS_ATTENDEE
      const hostCallsRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Phone Screening",
          slug: "phone-screening",
          durationMinutes: 15,
          location: {
            type: "HOST_CALLS_ATTENDEE",
            data: {
              extraNotes: "I will call you directly at the scheduled time.",
            },
          },
        });
      expect(hostCallsRes.status).toBe(201);
      expect(hostCallsRes.body.location.type).toBe("HOST_CALLS_ATTENDEE");

      // 5. ATTENDEE_CALLS_HOST
      const attCallsRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Call My Office",
          slug: "call-office",
          durationMinutes: 20,
          location: {
            type: "ATTENDEE_CALLS_HOST",
            data: {
              hostPhoneNumber: "+14155552671",
              extraNotes: "Extension 104",
            },
          },
        });
      expect(attCallsRes.status).toBe(201);
      expect(attCallsRes.body.location.type).toBe("ATTENDEE_CALLS_HOST");
      expect(attCallsRes.body.location.data.hostPhoneNumber).toBe("+14155552671");
    });

    it("rejects invalid location configurations (invalid URLs, empty addresses, short phone numbers)", async () => {
      const host = await setupHost(uniqueLabel("loc-invalid"));

      // Invalid URL scheme (e.g. javascript:)
      const badUrlRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Malicious Link",
          slug: "malicious-link",
          durationMinutes: 30,
          location: {
            type: "STATIC_VIDEO",
            data: { url: "javascript:alert(1)" },
          },
        });
      expect(badUrlRes.status).toBe(400);

      // Short address
      const badAddressRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Short Address",
          slug: "short-address",
          durationMinutes: 30,
          location: {
            type: "IN_PERSON",
            data: { address: "ab" },
          },
        });
      expect(badAddressRes.status).toBe(400);

      // Missing host phone number for ATTENDEE_CALLS_HOST
      const badPhoneRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Missing Phone",
          slug: "missing-phone",
          durationMinutes: 30,
          location: {
            type: "ATTENDEE_CALLS_HOST",
            data: { hostPhoneNumber: "12" },
          },
        });
      expect(badPhoneRes.status).toBe(400);
    });
  });

  describe("2. Server-Side Enforcement of Legacy Event Type Location Requirement", () => {
    it("enforces location configuration when updating a legacy event type with null location", async () => {
      const host = await setupHost(uniqueLabel("legacy-host"));

      // Seed a legacy event type directly with null location
      const legacy = await prisma.eventType.create({
        data: {
          userId: host.user.id,
          title: "Legacy Event",
          slug: "legacy-event",
          durationMinutes: 30,
          locationType: null,
        },
      });

      // Attempt update without providing location -> rejected with 400 LOCATION_REQUIRED
      const failedUpdate = await request(app.getHttpServer())
        .patch(`/api/v1/event-types/${legacy.id}`)
        .set("Cookie", host.cookies)
        .send({ durationMinutes: 45 });

      expect(failedUpdate.status).toBe(400);
      expect(failedUpdate.body.error.code).toBe("LOCATION_REQUIRED");

      // Update with valid location -> succeeds
      const successUpdate = await request(app.getHttpServer())
        .patch(`/api/v1/event-types/${legacy.id}`)
        .set("Cookie", host.cookies)
        .send({
          durationMinutes: 45,
          location: {
            type: "STATIC_VIDEO",
            data: { url: "https://meet.google.com/xyz-uvwx-rst" },
          },
        });

      expect(successUpdate.status).toBe(200);
      expect(successUpdate.body.durationMinutes).toBe(45);
      expect(successUpdate.body.location.type).toBe("STATIC_VIDEO");
    });
  });

  describe("3. Public Discovery Privacy (Zero Secret Leakage)", () => {
    it("does not expose host phone number, private video URL, or private venue address on unauthenticated discovery", async () => {
      const host = await setupHost(uniqueLabel("pub-privacy"));

      // Create ATTENDEE_CALLS_HOST
      await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Secret Phone Call",
          slug: "secret-phone",
          durationMinutes: 30,
          location: {
            type: "ATTENDEE_CALLS_HOST",
            data: {
              hostPhoneNumber: "+14155559999",
              extraNotes: "Dial ext 123",
            },
          },
        });

      // Create STATIC_VIDEO
      await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Private Zoom",
          slug: "private-zoom",
          durationMinutes: 30,
          location: {
            type: "STATIC_VIDEO",
            data: {
              url: "https://zoom.us/j/999888777?pwd=supersecretpasscode",
              extraNotes: "Confidential board room",
            },
          },
        });

      // Create IN_PERSON with displayPublicAddress: false
      await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Private Office",
          slug: "private-office",
          durationMinutes: 30,
          location: {
            type: "IN_PERSON",
            data: {
              address: "742 Evergreen Terrace, Springfield",
              displayPublicAddress: false,
              extraNotes: "Security checkpoint at gate",
            },
          },
        });

      // Query public discovery endpoint for ATTENDEE_CALLS_HOST
      const pubPhoneRes = await request(app.getHttpServer()).get(`/api/v1/public/${host.username}/secret-phone`);
      expect(pubPhoneRes.status).toBe(200);
      expect(pubPhoneRes.body.location.type).toBe("ATTENDEE_CALLS_HOST");
      expect(pubPhoneRes.text).not.toContain("+14155559999");

      // Query public discovery endpoint for STATIC_VIDEO
      const pubZoomRes = await request(app.getHttpServer()).get(`/api/v1/public/${host.username}/private-zoom`);
      expect(pubZoomRes.status).toBe(200);
      expect(pubZoomRes.body.location.type).toBe("STATIC_VIDEO");
      expect(pubZoomRes.text).not.toContain("https://zoom.us/j/999888777");
      expect(pubZoomRes.text).not.toContain("supersecretpasscode");

      // Query public discovery endpoint for private IN_PERSON
      const pubOfficeRes = await request(app.getHttpServer()).get(`/api/v1/public/${host.username}/private-office`);
      expect(pubOfficeRes.status).toBe(200);
      expect(pubOfficeRes.body.location.type).toBe("IN_PERSON");
      expect(pubOfficeRes.body.location.publicAddress).toBeUndefined();
      expect(pubOfficeRes.text).not.toContain("742 Evergreen Terrace");
    });
  });

  describe("4. Booking Phone Number Requirements (HOST_CALLS_ATTENDEE)", () => {
    it("requires a valid international attendee phone number for HOST_CALLS_ATTENDEE", async () => {
      const host = await setupHost(uniqueLabel("phone-req"));

      await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Host Calls You",
          slug: "host-calls-you",
          durationMinutes: 30,
          location: {
            type: "HOST_CALLS_ATTENDEE",
            data: {},
          },
        });

      const dateStr = getNextWeekdayDateStr();

      const slotsRes = await request(app.getHttpServer())
        .get(`/api/v1/public/${host.username}/host-calls-you/slots`)
        .query({ startDate: dateStr, endDate: dateStr, timezone: "America/New_York" });
      const slot = slotsRes.body[0];

      // Missing phone
      const missingPhone = await request(app.getHttpServer())
        .post(`/api/v1/public/${host.username}/host-calls-you/book`)
        .send({
          startUtc: slot.startUtc,
          attendeeName: "Bob Attendee",
          attendeeEmail: "bob@example.com",
          attendeeTimeZone: "America/New_York",
        });
      expect(missingPhone.status).toBe(400);
      expect(missingPhone.body.error.code).toBe("PHONE_REQUIRED");

      // Invalid phone format
      const invalidPhone = await request(app.getHttpServer())
        .post(`/api/v1/public/${host.username}/host-calls-you/book`)
        .send({
          startUtc: slot.startUtc,
          attendeeName: "Bob Attendee",
          attendeeEmail: "bob@example.com",
          attendeeTimeZone: "America/New_York",
          attendeePhoneNumber: "invalid-phone",
        });
      expect(invalidPhone.status).toBe(400);
      expect(invalidPhone.body.error.code).toBe("INVALID_PHONE");

      // Valid E.164 phone
      const validBooking = await request(app.getHttpServer())
        .post(`/api/v1/public/${host.username}/host-calls-you/book`)
        .send({
          startUtc: slot.startUtc,
          attendeeName: "Bob Attendee",
          attendeeEmail: "bob@example.com",
          attendeeTimeZone: "America/New_York",
          attendeePhoneNumber: "+14155551234",
        });
      expect(validBooking.status).toBe(201);
      expect(validBooking.body.attendeePhoneNumber).toBe("+14155551234");
      expect(validBooking.body.location.type).toBe("HOST_CALLS_ATTENDEE");
    });
  });

  describe("5. Booking Location Snapshot Isolation & Rescheduling Preservation", () => {
    it("preserves snapshotted location exactly, isolated from subsequent EventType edits and reschedules", async () => {
      const host = await setupHost(uniqueLabel("snapshot-host"));

      const evRes = await request(app.getHttpServer())
        .post("/api/v1/event-types")
        .set("Cookie", host.cookies)
        .send({
          title: "Strategy Session",
          slug: "strategy-session",
          durationMinutes: 30,
          location: {
            type: "IN_PERSON",
            data: {
              address: "100 Initial Venue Way",
              extraNotes: "Floor 2 Room A",
            },
          },
        });
      const eventTypeId = evRes.body.id;

      const dateStr = getNextWeekdayDateStr();

      const slotsRes = await request(app.getHttpServer())
        .get(`/api/v1/public/${host.username}/strategy-session/slots`)
        .query({ startDate: dateStr, endDate: dateStr, timezone: "America/New_York" });
      const slot1 = slotsRes.body[0];
      const slot2 = slotsRes.body[1];

      // 1. Create booking (Snapshots "100 Initial Venue Way")
      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/${host.username}/strategy-session/book`)
        .send({
          startUtc: slot1.startUtc,
          attendeeName: "Alice Snapshot",
          attendeeEmail: "alice@example.com",
          attendeeTimeZone: "America/New_York",
        });
      expect(bookRes.status).toBe(201);
      const bookingId = bookRes.body.id;
      const manageToken = bookRes.body.manageToken;
      expect(bookRes.body.location.data.address).toBe("100 Initial Venue Way");

      // 2. Host edits EventType location to "200 Modified Address St"
      const updateEvRes = await request(app.getHttpServer())
        .patch(`/api/v1/event-types/${eventTypeId}`)
        .set("Cookie", host.cookies)
        .send({
          location: {
            type: "IN_PERSON",
            data: {
              address: "200 Modified Address St",
              extraNotes: "Floor 10 Penthouse",
            },
          },
        });
      expect(updateEvRes.status).toBe(200);

      // 3. Query existing booking: must STILL be "100 Initial Venue Way"
      const existingBookingRes = await request(app.getHttpServer())
        .get(`/api/v1/public/bookings/${bookingId}`)
        .set("x-booking-token", manageToken);
      expect(existingBookingRes.status).toBe(200);
      expect(existingBookingRes.body.location.data.address).toBe("100 Initial Venue Way");

      // 4. Attendee reschedules booking: must STILL preserve "100 Initial Venue Way"
      const rescheduleRes = await request(app.getHttpServer())
        .patch(`/api/v1/public/bookings/${bookingId}/reschedule`)
        .set("x-booking-token", manageToken)
        .send({
          startUtc: slot2.startUtc,
          expectedSequence: 0,
          reason: "Need later slot",
        });
      expect(rescheduleRes.status).toBe(200);
      expect(rescheduleRes.body.sequence).toBe(1);
      expect(rescheduleRes.body.location.data.address).toBe("100 Initial Venue Way");

      // 5. Download .ics: verifies location is "100 Initial Venue Way" with RFC 5545 compliance
      const icsRes = await request(app.getHttpServer())
        .get(`/api/v1/public/bookings/${bookingId}/ics`)
        .set("x-booking-token", manageToken);
      expect(icsRes.status).toBe(200);
      expect(icsRes.text).toContain("LOCATION:100 Initial Venue Way");
      expect(icsRes.text).toContain("SEQUENCE:1");
    });
  });
});
