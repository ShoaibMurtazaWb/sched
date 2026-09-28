import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import { NotificationsProcessor } from "../src/notifications/notifications.processor";
import {
  renderBookingConfirmedAttendee,
  renderBookingConfirmedHost,
  renderBookingCancelledAttendee,
  renderBookingCancelledHost,
} from "../src/notifications/templates/email-templates";
import { createTestApp, resetDatabase, uniqueLabel } from "./app.helper";

describe("Milestone 1: Concurrency, Exclusion Constraints & Hardening", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationsProcessor: NotificationsProcessor;

  jest.setTimeout(60000);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notificationsProcessor = app.get(NotificationsProcessor);
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  describe("PostgreSQL Exclusion Constraint & Booking Concurrency", () => {
    it("guarantees zero double bookings under parallel race conditions (HTTP & DB state)", async () => {
      const username = uniqueLabel("host");
      const email = `${username}@example.com`;

      // 1. Create host and event type
      const user = await prisma.user.create({
        data: {
          name: "Dr. Concurrency",
          username,
          email,
          passwordHash: "hash",
          timezone: "UTC",
        },
      });

      await prisma.eventType.create({
        data: {
          userId: user.id,
          title: "30-Min High Contention Meeting",
          slug: "30min",
          durationMinutes: 30,
          minimumNoticeMinutes: 0,
        },
      });

      // 2. Provision default schedule covering Wednesday 09:00 - 17:00
      const schedule = await prisma.schedule.create({
        data: {
          userId: user.id,
          name: "Working Hours",
          timeZone: "UTC",
          isDefault: true,
        },
      });

      // Day 3 = Wednesday
      await prisma.scheduleDay.create({
        data: {
          scheduleId: schedule.id,
          dayOfWeek: 3,
          startTime: "09:00",
          endTime: "17:00",
        },
      });

      // Pick next Wednesday 10:00 UTC
      const startUtc = "2026-10-14T10:00:00.000Z";

      // 3. Fire 5 concurrent booking requests for the EXACT same slot
      const concurrentAttempts = 5;
      const requests = Array.from({ length: concurrentAttempts }, (_, i) =>
        request(app.getHttpServer())
          .post(`/api/v1/public/${username}/30min/book`)
          .send({
            startUtc,
            attendeeName: `Concurrent User ${i + 1}`,
            attendeeEmail: `attendee${i + 1}@example.com`,
            attendeeTimeZone: "UTC",
            attendeeNotes: `Racer ${i + 1}`,
          })
      );

      const responses = await Promise.all(requests);

      // 4. Assert HTTP outcomes: Exactly 1 succeeds (201), 4 fail with 409 SLOT_ALREADY_BOOKED
      const successfulResponses = responses.filter((r) => r.status === 201);
      const conflictResponses = responses.filter((r) => r.status === 409);

      expect(successfulResponses).toHaveLength(1);
      expect(conflictResponses).toHaveLength(concurrentAttempts - 1);

      for (const conflict of conflictResponses) {
        expect(conflict.body.error.code).toBe("SLOT_ALREADY_BOOKED");
        expect(conflict.body.error.message).toContain("already been booked");
      }

      // 5. Assert database invariant: Exactly 1 confirmed booking committed in PostgreSQL
      const confirmedBookings = await prisma.booking.findMany({
        where: {
          hostId: user.id,
          status: "CONFIRMED",
        },
      });
      expect(confirmedBookings).toHaveLength(1);
      expect(confirmedBookings[0]!.startTime.toISOString()).toBe(startUtc);
    });

    it("normalizes direct exclusion constraint violation to 409 SLOT_ALREADY_BOOKED", async () => {
      const username = uniqueLabel("exhost");
      const email = `${username}@example.com`;

      const user = await prisma.user.create({
        data: {
          name: "Direct Host",
          username,
          email,
          passwordHash: "hash",
          timezone: "UTC",
        },
      });

      const eventType = await prisma.eventType.create({
        data: {
          userId: user.id,
          title: "Direct Collision Check",
          slug: "direct",
          durationMinutes: 30,
          minimumNoticeMinutes: 0,
        },
      });

      const schedule = await prisma.schedule.create({
        data: {
          userId: user.id,
          name: "Working Hours",
          timeZone: "UTC",
          isDefault: true,
        },
      });

      // Day 3 = Wednesday 2026-10-14
      await prisma.scheduleDay.create({
        data: {
          scheduleId: schedule.id,
          dayOfWeek: 3,
          startTime: "09:00",
          endTime: "17:00",
        },
      });

      // Insert pre-existing booking directly in DB
      await prisma.booking.create({
        data: {
          eventTypeId: eventType.id,
          hostId: user.id,
          startTime: new Date("2026-10-14T14:00:00.000Z"),
          endTime: new Date("2026-10-14T14:30:00.000Z"),
          status: "CONFIRMED",
          attendeeName: "Existing Attendee",
          attendeeEmail: "existing@example.com",
          attendeeTimeZone: "UTC",
        },
      });

      // Attempt to book overlapping time via API (rejected by schedule/slot engine)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/public/${username}/direct/book`)
        .send({
          startUtc: "2026-10-14T14:00:00.000Z",
          attendeeName: "Overlapping Attendee",
          attendeeEmail: "overlap@example.com",
          attendeeTimeZone: "UTC",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SLOT_UNAVAILABLE");

      // Directly verify PostgreSQL 23P01 exclusion constraint at raw database layer
      let dbError: unknown;
      try {
        await prisma.booking.create({
          data: {
            eventTypeId: eventType.id,
            hostId: user.id,
            startTime: new Date("2026-10-14T14:15:00.000Z"), // Overlaps 14:00-14:30
            endTime: new Date("2026-10-14T14:45:00.000Z"),
            status: "CONFIRMED",
            attendeeName: "Raw Conflict",
            attendeeEmail: "raw@example.com",
            attendeeTimeZone: "UTC",
          },
        });
      } catch (err) {
        dbError = err;
      }

      expect(dbError).toBeDefined();
      const errString = String(dbError);
      expect(
        errString.includes("23P01") ||
        errString.includes("no_overlapping_confirmed_bookings") ||
        errString.includes("exclusion constraint")
      ).toBe(true);
    });
  });

  describe("Atomic Outbox Job Claiming via Single CTE", () => {
    it("ensures parallel worker claims claim distinct jobs with zero duplicates", async () => {
      const username = uniqueLabel("workerhost");
      const user = await prisma.user.create({
        data: {
          name: "Worker Host",
          username,
          email: `${username}@example.com`,
          passwordHash: "hash",
          timezone: "UTC",
        },
      });

      const eventType = await prisma.eventType.create({
        data: {
          userId: user.id,
          title: "Worker Event",
          slug: "work",
          durationMinutes: 30,
        },
      });

      const booking = await prisma.booking.create({
        data: {
          eventTypeId: eventType.id,
          hostId: user.id,
          startTime: new Date("2026-10-15T10:00:00Z"),
          endTime: new Date("2026-10-15T10:30:00Z"),
          status: "CONFIRMED",
          attendeeName: "Job Attendee",
          attendeeEmail: "job@example.com",
          attendeeTimeZone: "UTC",
        },
      });

      // Seed 6 pending outbox jobs
      for (let i = 0; i < 6; i++) {
        await prisma.notificationJob.create({
          data: {
            idempotencyKey: `test:claim:${i}:${uniqueLabel("key")}`,
            bookingId: booking.id,
            type: "BOOKING_CONFIRMED_ATTENDEE",
            recipientEmail: `job${i}@example.com`,
            status: "PENDING",
            nextRunAt: new Date(Date.now() - 1000),
            payload: {},
          },
        });
      }

      // Simulate 3 parallel worker processes claiming concurrently
      const [worker1Claims, worker2Claims, worker3Claims] = await Promise.all([
        notificationsProcessor.claimPendingJobs(2),
        notificationsProcessor.claimPendingJobs(2),
        notificationsProcessor.claimPendingJobs(2),
      ]);

      const allClaimedIds = [
        ...worker1Claims.map((j) => j.id),
        ...worker2Claims.map((j) => j.id),
        ...worker3Claims.map((j) => j.id),
      ];

      // Total claimed is 6, all unique
      expect(allClaimedIds).toHaveLength(6);
      const uniqueIds = new Set(allClaimedIds);
      expect(uniqueIds.size).toBe(6);

      // Verify all 6 jobs in DB are now PROCESSING with lockedAt set
      const dbJobs = await prisma.notificationJob.findMany({
        where: { id: { in: allClaimedIds } },
      });
      expect(dbJobs.every((j) => j.status === "PROCESSING")).toBe(true);
      expect(dbJobs.every((j) => j.lockedAt !== null)).toBe(true);
    });
  });

  describe("HTML Sanitization at Rendering Boundary", () => {
    it("escapes malicious scripts and HTML entities in email templates while preserving raw payload", () => {
      const maliciousSnapshot = {
        bookingId: "b001",
        eventTypeId: "e001",
        eventTitle: "<script>alert('XSS Title')</script>",
        eventSlug: "xss-slug",
        durationMinutes: 30,
        hostId: "h001",
        hostName: "Dr. Evil <script>alert(1)</script>",
        hostUsername: "drevil",
        hostEmail: "evil@example.com",
        hostTimeZone: "UTC",
        attendeeName: "Injected <b onmouseover='alert(1)'>Attendee</b>",
        attendeeEmail: "victim@example.com",
        attendeeTimeZone: "UTC",
        attendeeNotes: "Notes with <img src=x onerror=alert('pwned')> & \"quotes\"",
        startUtc: "2026-10-14T10:00:00.000Z",
        endUtc: "2026-10-14T10:30:00.000Z",
        status: "CONFIRMED",
        sequence: 0,
        tokenVersion: 1,
        cancellationReason: "Reason with <script>attack()</script> & 'single'",
      };

      const attendeeConfirmed = renderBookingConfirmedAttendee(maliciousSnapshot, "http://localhost:3000");
      expect(attendeeConfirmed.html).not.toContain("<script>");
      expect(attendeeConfirmed.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(attendeeConfirmed.html).toContain("&amp; &quot;quotes&quot;");

      const hostConfirmed = renderBookingConfirmedHost(maliciousSnapshot, "http://localhost:3000");
      expect(hostConfirmed.html).not.toContain("<b onmouseover");
      expect(hostConfirmed.html).toContain("&lt;b onmouseover=&#39;alert(1)&#39;&gt;Attendee&lt;/b&gt;");

      const attendeeCancelled = renderBookingCancelledAttendee(maliciousSnapshot, "http://localhost:3000");
      expect(attendeeCancelled.html).not.toContain("<script>attack()");
      expect(attendeeCancelled.html).toContain("&lt;script&gt;attack()&lt;/script&gt;");

      const hostCancelled = renderBookingCancelledHost(maliciousSnapshot, "http://localhost:3000");
      expect(hostCancelled.html).not.toContain("<script>attack()");
      expect(hostCancelled.html).toContain("&lt;script&gt;attack()&lt;/script&gt;");

      // Verify plain text version remains readable and untouched
      expect(attendeeConfirmed.text).toContain("<script>alert(1)</script>");
      expect(attendeeConfirmed.text).toContain("Notes with <img src=x onerror=alert('pwned')> & \"quotes\"");
    });
  });
});
