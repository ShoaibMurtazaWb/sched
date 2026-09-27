import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  BookingActor,
  CalendarIntegrationStatus,
  CalendarProviderType,
  LocationType,
} from "@prisma/client";
import type {
  BookingResponse,
  CreateBookingBody,
  ListBookingsQuery,
  RescheduleBookingBody,
} from "@sched/api-contract";
import { phoneSchema } from "@sched/api-contract";
import { GoogleCalendarService } from "../integrations/services/google-calendar.service";
import { ZoomService } from "../integrations/services/zoom.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from "../shared/errors/app-error";
import { PrismaService } from "../shared/prisma/prisma.service";
import { BookingTokenService } from "../shared/services/booking-token.service";
import {
  parseStoredBookingCustomResponses,
  parseStoredCustomQuestions,
  validateAndBuildCustomResponses,
} from "../shared/utils/custom-questions-parser";
import { generateIcsCalendar } from "../shared/utils/ics-formatter";
import { parseBookingLocation } from "../shared/utils/location-parser";
import { SchedulesService } from "../schedules/schedules.service";
import { SlotsService } from "../schedules/slots.service";

@Injectable()
export class BookingsService {
  private readonly logger = new Logger("BookingsService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: SchedulesService,
    private readonly slots: SlotsService,
    private readonly notifications: NotificationsService,
    private readonly tokenService: BookingTokenService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly zoomService: ZoomService
  ) {}

  async createBooking(
    username: string,
    eventSlug: string,
    dto: CreateBookingBody
  ): Promise<BookingResponse> {
    const eventType = await this.prisma.eventType.findFirst({
      where: {
        slug: eventSlug,
        archivedAt: null,
        user: { username },
      },
      include: { user: true },
    });

    if (!eventType) {
      throw new NotFoundError();
    }

    // Verify host Zoom integration is active if this event type requires Zoom
    if (eventType.locationType === LocationType.ZOOM) {
      const zoomIntegration = await this.prisma.zoomIntegration.findUnique({
        where: { userId: eventType.userId },
      });
      if (
        !zoomIntegration ||
        zoomIntegration.status !== "CONNECTED" ||
        !zoomIntegration.encryptedAccessToken ||
        !zoomIntegration.encryptedRefreshToken
      ) {
        throw new BadRequestError(
          "ZOOM_NOT_CONNECTED",
          "The host has not connected their Zoom account or the integration is inactive. This meeting cannot be booked at this time."
        );
      }
    }

    // Phone validation for HOST_CALLS_ATTENDEE
    let attendeePhone = dto.attendeePhoneNumber?.trim() || null;
    if (eventType.locationType === LocationType.HOST_CALLS_ATTENDEE) {
      if (!attendeePhone) {
        throw new BadRequestError("PHONE_REQUIRED", "Phone number is required for this meeting type.");
      }
      const parsedPhone = phoneSchema.safeParse(attendeePhone);
      if (!parsedPhone.success) {
        throw new BadRequestError(
          "INVALID_PHONE",
          "Phone number must be in valid international format (e.g. +14155552671)."
        );
      }
      attendeePhone = parsedPhone.data;
    }

    // Custom Booking Questions Validation & Snapshot Preparation
    const configuredQuestions = parseStoredCustomQuestions(eventType.customQuestions);
    const customResponses = validateAndBuildCustomResponses(configuredQuestions, dto.customResponses);

    const now = new Date();

    const startUtc = new Date(dto.startUtc);
    if (isNaN(startUtc.getTime())) {
      throw new ConflictError("INVALID_DATE", "Invalid start date time.");
    }

    const minNoticeMs = eventType.minimumNoticeMinutes * 60 * 1000;
    if (startUtc.getTime() < now.getTime() + minNoticeMs) {
      throw new ConflictError(
        "MINIMUM_NOTICE_VIOLATION",
        `Bookings require at least ${eventType.minimumNoticeMinutes} minutes advance notice.`
      );
    }

    const endUtc = new Date(startUtc.getTime() + eventType.durationMinutes * 60 * 1000);

    // Check if the attendee already has a confirmed booking that overlaps this requested time slot
    const existingAttendeeSlotBooking = await this.prisma.booking.findFirst({
      where: {
        eventTypeId: eventType.id,
        attendeeEmail: { equals: dto.attendeeEmail.trim(), mode: "insensitive" },
        status: "CONFIRMED",
        startTime: { lt: endUtc },
        endTime: { gt: startUtc },
      },
      orderBy: { startTime: "asc" },
    });

    if (existingAttendeeSlotBooking) {
      const manageToken = this.tokenService.generateToken(
        existingAttendeeSlotBooking.id,
        existingAttendeeSlotBooking.tokenVersion
      );
      const manageUrl = `/public/bookings/${existingAttendeeSlotBooking.id}?token=${manageToken}`;

      throw new ConflictError(
        "BOOKING_ALREADY_EXISTS",
        "You already have a booking for this time slot.",
        {
          booking: {
            id: existingAttendeeSlotBooking.id,
            startTime: existingAttendeeSlotBooking.startTime.toISOString(),
            manageUrl,
          },
        }
      );
    }

    // Validate that the slot is available in the schedule
    const schedule = await this.schedules.getDefaultSchedule(eventType.userId);

    const existingBookings = await this.prisma.booking.findMany({
      where: {
        hostId: eventType.userId,
        status: "CONFIRMED",
        startTime: {
          gte: new Date(startUtc.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(endUtc.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { startTime: true, endTime: true },
    });

    const prevDateStr = new Date(startUtc.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const nextDateStr = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const computedSlots = this.slots.computeAvailableSlots(
      schedule,
      eventType,
      prevDateStr,
      nextDateStr,
      dto.attendeeTimeZone,
      now,
      existingBookings
    );

    const isSlotValid = computedSlots.some(
      (s) => Math.abs(new Date(s.startUtc).getTime() - startUtc.getTime()) < 1000
    );

    if (!isSlotValid) {
      this.logger.warn(`Slot validation failed: target startUtc=${startUtc.toISOString()} (time=${startUtc.getTime()}), window=[${prevDateStr}, ${nextDateStr}], found ${computedSlots.length} slots. First 3: ${JSON.stringify(computedSlots.slice(0, 3))}`);
      throw new ConflictError(
        "SLOT_UNAVAILABLE",
        "The selected time slot is not available according to host schedule or notice rules."
      );
    }

    // Pre-transaction Google FreeBusy check:
    // Note: The final Google FreeBusy check reduces external race risk but cannot provide
    // the same atomic guarantee as PostgreSQL's internal booking exclusion constraint.
    const googleIntegration = await this.prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId: eventType.userId, provider: CalendarProviderType.GOOGLE } },
    });

    if (googleIntegration && googleIntegration.status === CalendarIntegrationStatus.CONNECTED) {
      try {
        const isAvailable = await this.googleCalendar.checkAvailability(
          eventType.userId,
          startUtc,
          endUtc,
          2500
        );

        if (!isAvailable) {
          throw new ConflictError(
            "SLOT_ALREADY_BOOKED",
            "The selected time slot conflicts with an event on the host's Google Calendar."
          );
        }
      } catch (err) {
        if (err instanceof ConflictError) throw err;
        this.logger.error("Google Calendar availability check failed during booking creation", err);
        throw new ServiceUnavailableError(
          "CALENDAR_AVAILABILITY_UNAVAILABLE",
          "Unable to verify host external calendar availability. Please try again."
        );
      }
    }

    // Double-booking prevention with atomic transaction and PostgreSQL GiST exclusion constraint
    const bufferedStart = new Date(startUtc.getTime() - eventType.beforeBufferMinutes * 60 * 1000);
    const bufferedEnd = new Date(endUtc.getTime() + eventType.afterBufferMinutes * 60 * 1000);

    let bookingLocationData = eventType.locationData ?? undefined;
    let createdZoomMeetingId: string | null = null;

    if (eventType.locationType === LocationType.ZOOM) {
      const zoomMeeting = await this.zoomService.createMeeting(eventType.userId, {
        topic: `${eventType.title} - ${dto.attendeeName} & ${eventType.user.name}`,
        startTime: startUtc,
        durationMinutes: eventType.durationMinutes,
        timezone: eventType.user.timezone || dto.attendeeTimeZone || "UTC",
      });
      createdZoomMeetingId = zoomMeeting.meetingId;
      bookingLocationData = {
        type: "ZOOM",
        joinUrl: zoomMeeting.joinUrl,
        startUrl: zoomMeeting.startUrl,
        meetingId: zoomMeeting.meetingId,
        password: zoomMeeting.password,
        extraNotes: (eventType.locationData as Record<string, unknown> | null)?.extraNotes || undefined,
      };
    }

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        // In-band check for collision (including custom buffer minutes)
        const collision = await tx.booking.findFirst({
          where: {
            hostId: eventType.userId,
            status: "CONFIRMED",
            startTime: { lt: bufferedEnd },
            endTime: { gt: bufferedStart },
          },
        });

        if (collision) {
          throw new ConflictError(
            "SLOT_ALREADY_BOOKED",
            "This time slot has already been booked by someone else."
          );
        }

        const created = await tx.booking.create({
          data: {
            eventTypeId: eventType.id,
            hostId: eventType.userId,
            startTime: startUtc,
            endTime: endUtc,
            status: "CONFIRMED",
            sequence: 0,
            tokenVersion: 1,
            attendeeName: dto.attendeeName,
            attendeeEmail: dto.attendeeEmail,
            attendeeTimeZone: dto.attendeeTimeZone,
            attendeePhoneNumber: attendeePhone,
            attendeeNotes: dto.attendeeNotes ?? "",
            locationType: eventType.locationType,
            locationData: (bookingLocationData as unknown as Prisma.InputJsonValue) ?? undefined,
            customResponses:
              customResponses.length > 0 ? (customResponses as unknown as Prisma.InputJsonValue) : undefined,
          },
          include: {
            eventType: true,
            host: true,
          },
        });

        // Atomically enqueue transactional notification outbox jobs
        await this.notifications.enqueueConfirmationJobsInTx(tx, created);
        await this.notifications.enqueueReminderJobsInTx(tx, created, now);

        // Atomically enqueue transactional calendar sync outbox job
        if (googleIntegration && googleIntegration.status === CalendarIntegrationStatus.CONNECTED) {
          await tx.calendarSyncJob.create({
            data: {
              bookingId: created.id,
              integrationId: googleIntegration.id,
              calendarId: googleIntegration.selectedCalendarId || "primary",
              sequence: created.sequence, // sequence 0 on creation
              status: "PENDING",
              payload: {
                bookingId: created.id,
                sequence: created.sequence,
                status: created.status,
              },
            },
          });
        }

        return created;
      }, { maxWait: 15000, timeout: 25000 });

      const manageToken = this.tokenService.generateToken(booking.id, booking.tokenVersion);
      return {
        ...this.mapToResponse(booking),
        manageToken,
      };
    } catch (error: unknown) {
      // Compensating action: If Zoom meeting was created but database transaction failed, delete the orphaned Zoom meeting
      if (createdZoomMeetingId) {
        try {
          await this.zoomService.deleteMeeting(eventType.userId, createdZoomMeetingId);
        } catch (cleanupErr) {
          this.logger.warn(`Failed to cleanup orphaned Zoom meeting ${createdZoomMeetingId}: ${cleanupErr}`);
        }
      }

      const dbErr = error as { code?: string };
      if (dbErr?.code === "23P01" || dbErr?.code === "P2002") {
        throw new ConflictError(
          "SLOT_ALREADY_BOOKED",
          "This time slot has already been booked by someone else."
        );
      }
      throw error;
    }
  }

  async listHostBookings(userId: string, query: ListBookingsQuery): Promise<BookingResponse[]> {
    const now = new Date();
    const where: Prisma.BookingWhereInput = {
      hostId: userId,
    };

    if (query.status === "upcoming") {
      where.status = "CONFIRMED";
      where.startTime = { gte: now };
    } else if (query.status === "past") {
      where.status = "CONFIRMED";
      where.startTime = { lt: now };
    } else if (query.status === "cancelled") {
      where.status = "CANCELLED";
    }

    const rows = await this.prisma.booking.findMany({
      where,
      orderBy: { startTime: query.status === "past" ? "desc" : "asc" },
      include: {
        eventType: true,
        host: true,
      },
    });

    return rows.map((r) => this.mapToResponse(r));
  }

  async getHostBookings(userId: string, query: ListBookingsQuery): Promise<BookingResponse[]> {
    return this.listHostBookings(userId, query);
  }

  async getPublicBooking(bookingId: string, token: string | undefined): Promise<BookingResponse> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        eventType: true,
        host: true,
      },
    });

    if (!booking || (token && !this.tokenService.verifyToken(booking.id, token, booking.tokenVersion))) {
      throw new NotFoundError("Booking not found or this link is no longer valid.");
    }

    const isValidToken = Boolean(token && this.tokenService.verifyToken(booking.id, token, booking.tokenVersion));
    const manageToken = isValidToken && token ? this.tokenService.generateToken(booking.id, booking.tokenVersion) : undefined;
    return {
      ...this.mapToResponse(booking),
      manageToken,
    };
  }

  async rescheduleBooking(
    bookingId: string,
    dto: RescheduleBookingBody,
    actor: BookingActor,
    hostUserId?: string,
    token?: string
  ): Promise<BookingResponse> {
    const startUtc = new Date(dto.startUtc);
    if (isNaN(startUtc.getTime())) {
      throw new ConflictError("INVALID_DATE", "Invalid start date time.");
    }

    // Fetch existing booking to check host integration and slot duration
    const existingBooking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { eventType: true },
    });
    if (!existingBooking) {
      throw new NotFoundError("Booking not found or this link is no longer valid.");
    }

    const durationMs = existingBooking.endTime.getTime() - existingBooking.startTime.getTime();
    const endUtc = new Date(startUtc.getTime() + durationMs);

    // Pre-transaction Google FreeBusy check for reschedule
    const googleIntegration = await this.prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId: existingBooking.hostId, provider: CalendarProviderType.GOOGLE } },
    });

    if (googleIntegration && googleIntegration.status === CalendarIntegrationStatus.CONNECTED) {
      try {
        const isAvailable = await this.googleCalendar.checkAvailability(
          existingBooking.hostId,
          startUtc,
          endUtc,
          2500
        );

        if (!isAvailable) {
          throw new ConflictError(
            "SLOT_ALREADY_BOOKED",
            "The selected time slot conflicts with an event on the host's Google Calendar."
          );
        }
      } catch (err) {
        if (err instanceof ConflictError) throw err;
        this.logger.error("Google Calendar availability check failed during reschedule", err);
        throw new ServiceUnavailableError(
          "CALENDAR_AVAILABILITY_UNAVAILABLE",
          "Unable to verify host external calendar availability. Please try again."
        );
      }
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // 1. Acquire explicit row lock
        const lockedRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "bookings" WHERE id = ${bookingId}::uuid FOR UPDATE
        `;

        if (!lockedRows || lockedRows.length === 0) {
          throw new NotFoundError("Booking not found or this link is no longer valid.");
        }

        // 2. Load typed booking with relations inside transaction
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            eventType: true,
            host: true,
          },
        });

        if (!booking) {
          throw new NotFoundError("Booking not found or this link is no longer valid.");
        }

        // Authorization validation
        if (actor === BookingActor.HOST) {
          if (!hostUserId || booking.hostId !== hostUserId) {
            throw new NotFoundError("Booking not found or this link is no longer valid.");
          }
        } else {
          if (!token || !this.tokenService.verifyToken(booking.id, token, booking.tokenVersion)) {
            throw new NotFoundError("Booking not found or this link is no longer valid.");
          }
        }

        // 3. Optimistic version check
        if (booking.sequence !== dto.expectedSequence) {
          throw new ConflictError(
            "BOOKING_VERSION_CONFLICT",
            "This booking was modified by another request. Please reload and try again."
          );
        }

        // 4. Minimum notice check
        const now = new Date();
        const minNoticeMs = booking.eventType.minimumNoticeMinutes * 60 * 1000;
        if (startUtc.getTime() < now.getTime() + minNoticeMs) {
          throw new ConflictError(
            "MINIMUM_NOTICE_VIOLATION",
            `Bookings require at least ${booking.eventType.minimumNoticeMinutes} minutes advance notice.`
          );
        }

        // 5. In-band availability verification ignoring the current booking
        const schedule = await this.schedules.getDefaultSchedule(booking.hostId);
        const timezone = dto.timeZone || booking.attendeeTimeZone;

        const otherBookings = await tx.booking.findMany({
          where: {
            hostId: booking.hostId,
            status: "CONFIRMED",
            id: { not: booking.id },
            startTime: {
              gte: new Date(startUtc.getTime() - 24 * 60 * 60 * 1000),
              lte: new Date(endUtc.getTime() + 24 * 60 * 60 * 1000),
            },
          },
          select: { startTime: true, endTime: true },
        });

        const prevDateStr = new Date(startUtc.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const nextDateStr = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const computedSlots = this.slots.computeAvailableSlots(
          schedule,
          booking.eventType,
          prevDateStr,
          nextDateStr,
          timezone,
          now,
          otherBookings
        );

        const isSlotValid = computedSlots.some(
          (s) => Math.abs(new Date(s.startUtc).getTime() - startUtc.getTime()) < 1000
        );

        if (!isSlotValid) {
          throw new ConflictError(
            "SLOT_UNAVAILABLE",
            "The selected time slot is not available according to host schedule or notice rules."
          );
        }

        // 6. Check buffer collisions
        const bufferedStart = new Date(
          startUtc.getTime() - booking.eventType.beforeBufferMinutes * 60 * 1000
        );
        const bufferedEnd = new Date(
          endUtc.getTime() + booking.eventType.afterBufferMinutes * 60 * 1000
        );

        const collision = await tx.booking.findFirst({
          where: {
            hostId: booking.hostId,
            status: "CONFIRMED",
            id: { not: booking.id },
            startTime: { lt: bufferedEnd },
            endTime: { gt: bufferedStart },
          },
        });

        if (collision) {
          throw new ConflictError(
            "SLOT_ALREADY_BOOKED",
            "This time slot has already been booked by someone else."
          );
        }

        // 7. Calculate new sequence and record audit history
        const newSequence = booking.sequence + 1;
        await tx.bookingRescheduleHistory.create({
          data: {
            bookingId: booking.id,
            sequence: newSequence,
            previousStartTime: booking.startTime,
            previousEndTime: booking.endTime,
            newStartTime: startUtc,
            newEndTime: endUtc,
            rescheduledBy: actor,
            reason: dto.reason ?? null,
          },
        });

        // 8. Update booking: atomic sequence increment, reactivate if cancelled
        const res = await tx.booking.update({
          where: { id: booking.id },
          data: {
            startTime: startUtc,
            endTime: endUtc,
            status: "CONFIRMED",
            cancellationReason: null,
            cancelledAt: null,
            cancelledBy: null,
            sequence: newSequence,
            rescheduleCount: booking.rescheduleCount + 1,
            rescheduledAt: now,
            rescheduledBy: actor,
            rescheduleReason: dto.reason ?? null,
            previousStartTime: booking.startTime,
            previousEndTime: booking.endTime,
          },
          include: {
            eventType: true,
            host: true,
          },
        });

        // 9. Manage notification outbox jobs
        await this.notifications.cancelPendingReminderJobsInTx(tx, booking.id);
        await this.notifications.enqueueRescheduleJobsInTx(tx, res);
        await this.notifications.enqueueReminderJobsInTx(tx, res, now);

        // 10. Enqueue calendar sync outbox job for reschedule
        if (googleIntegration && googleIntegration.status === CalendarIntegrationStatus.CONNECTED) {
          await tx.calendarSyncJob.create({
            data: {
              bookingId: res.id,
              integrationId: googleIntegration.id,
              calendarId: googleIntegration.selectedCalendarId || "primary",
              sequence: newSequence,
              status: "PENDING",
              payload: {
                bookingId: res.id,
                sequence: newSequence,
                status: res.status,
              },
            },
          });
        }

        return res;
      }, { maxWait: 15000, timeout: 25000 });

      // Asynchronously update dynamic Zoom meeting schedule if connected
      if (updated.locationType === LocationType.ZOOM) {
        const locData = updated.locationData as Record<string, unknown> | null;
        if (locData?.meetingId) {
          void this.zoomService.updateMeeting(updated.hostId, String(locData.meetingId), {
            startTime: startUtc,
            durationMinutes: updated.eventType.durationMinutes,
            timezone: updated.host.timezone || updated.attendeeTimeZone || "UTC",
          });
        } else {
          void (async () => {
            try {
              const newMeeting = await this.zoomService.createMeeting(updated.hostId, {
                topic: `${updated.eventType.title} - ${updated.attendeeName} & ${updated.host.name}`,
                startTime: startUtc,
                durationMinutes: updated.eventType.durationMinutes,
                timezone: updated.host.timezone || updated.attendeeTimeZone || "UTC",
              });
              await this.prisma.booking.update({
                where: { id: updated.id },
                data: {
                  locationData: {
                    type: "ZOOM",
                    joinUrl: newMeeting.joinUrl,
                    startUrl: newMeeting.startUrl,
                    meetingId: newMeeting.meetingId,
                    password: newMeeting.password,
                    extraNotes: locData?.extraNotes || undefined,
                  } as unknown as Prisma.InputJsonValue,
                },
              });
            } catch (err) {
              this.logger.warn(`Could not create replacement Zoom meeting on reschedule: ${err}`);
            }
          })();
        }
      }

      const manageToken = this.tokenService.generateToken(updated.id, updated.tokenVersion);
      return {
        ...this.mapToResponse(updated),
        manageToken,
      };
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr?.code === "23P01" || dbErr?.code === "P2002") {
        throw new ConflictError(
          "SLOT_ALREADY_BOOKED",
          "This time slot has already been booked by someone else."
        );
      }
      throw error;
    }
  }

  async cancelBooking(
    bookingId: string,
    expectedSequence: number,
    reason: string | undefined,
    actor: BookingActor,
    hostUserId?: string,
    token?: string
  ): Promise<BookingResponse> {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      // 1. Acquire explicit row lock
      const lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "bookings" WHERE id = ${bookingId}::uuid FOR UPDATE
      `;

      if (!lockedRows || lockedRows.length === 0) {
        throw new NotFoundError("Booking not found or this link is no longer valid.");
      }

      // 2. Load typed booking inside transaction
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          eventType: true,
          host: true,
        },
      });

      if (!booking) {
        throw new NotFoundError("Booking not found or this link is no longer valid.");
      }

      // Authorization validation
      if (actor === BookingActor.HOST) {
        if (!hostUserId || booking.hostId !== hostUserId) {
          throw new NotFoundError("Booking not found or this link is no longer valid.");
        }
      } else {
        if (!token || !this.tokenService.verifyToken(booking.id, token, booking.tokenVersion)) {
          throw new NotFoundError("Booking not found or this link is no longer valid.");
        }
      }

      if (booking.status === "CANCELLED") {
        return booking;
      }

      // 3. Optimistic version check
      if (booking.sequence !== expectedSequence) {
        throw new ConflictError(
          "BOOKING_VERSION_CONFLICT",
          "This booking was modified by another request. Please reload and try again."
        );
      }

      const now = new Date();
      const newSequence = booking.sequence + 1;
      const res = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          sequence: newSequence,
          cancelledAt: now,
          cancelledBy: actor,
          cancellationReason: reason || null,
        },
        include: {
          eventType: true,
          host: true,
        },
      });

      // Atomically cancel pending reminder jobs and enqueue cancellation notification outbox jobs
      await this.notifications.cancelPendingReminderJobsInTx(tx, booking.id);
      await this.notifications.enqueueCancellationJobsInTx(tx, res);

      // Atomically enqueue calendar sync outbox job for cancellation
      const googleIntegration = await tx.calendarIntegration.findUnique({
        where: { userId_provider: { userId: booking.hostId, provider: CalendarProviderType.GOOGLE } },
      });
      if (googleIntegration && googleIntegration.status === CalendarIntegrationStatus.CONNECTED) {
        await tx.calendarSyncJob.create({
          data: {
            bookingId: res.id,
            integrationId: googleIntegration.id,
            calendarId: googleIntegration.selectedCalendarId || "primary",
            sequence: newSequence,
            status: "PENDING",
            payload: {
              bookingId: res.id,
              sequence: newSequence,
              status: "CANCELLED",
            },
          },
        });
      }

      return res;
    }, { maxWait: 15000, timeout: 25000 });

    // Asynchronously delete dynamic Zoom meeting from host account if exists
    if (cancelled.locationType === LocationType.ZOOM && cancelled.locationData) {
      const locData = cancelled.locationData as Record<string, unknown>;
      if (locData?.meetingId) {
        void this.zoomService.deleteMeeting(cancelled.hostId, String(locData.meetingId));
      }
    }

    const manageToken = this.tokenService.generateToken(cancelled.id, cancelled.tokenVersion);
    return {
      ...this.mapToResponse(cancelled),
      manageToken,
    };
  }


  async getBookingIcs(
    bookingId: string,
    token: string
  ): Promise<{ filename: string; content: string }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        eventType: true,
        host: true,
      },
    });

    if (!booking || !this.tokenService.verifyToken(booking.id, token, booking.tokenVersion)) {
      throw new NotFoundError("Booking not found or this link is no longer valid.");
    }

    const filename = `${booking.eventType.slug}-${booking.id.slice(0, 8)}-v${booking.sequence}.ics`;
    const content = generateIcsCalendar({
      uid: `${booking.id}@sched.com`,
      sequence: booking.sequence,
      dtstamp: new Date(),
      startTime: new Date(booking.startTime),
      endTime: new Date(booking.endTime),
      summary: `${booking.eventType.title} with ${booking.host.name}`,
      description: `Meeting between ${booking.host.name} and ${booking.attendeeName}\n\nNotes: ${
        booking.attendeeNotes || "None"
      }`,
      status: booking.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
      locationType: booking.locationType,
      locationData: booking.locationData as Record<string, unknown> | null,
      attendeePhoneNumber: booking.attendeePhoneNumber,
      hostName: booking.host.name,
      attendeeName: booking.attendeeName,
    });

    return {
      filename,
      content,
    };
  }

  async cancelByAttendee(
    bookingId: string,
    token: string | undefined,
    expectedSequence: number,
    reason?: string
  ): Promise<BookingResponse> {
    return this.cancelBooking(bookingId, expectedSequence, reason, BookingActor.ATTENDEE, undefined, token);
  }

  async rescheduleByAttendee(
    bookingId: string,
    token: string | undefined,
    dto: RescheduleBookingBody
  ): Promise<BookingResponse> {
    return this.rescheduleBooking(bookingId, dto, BookingActor.ATTENDEE, undefined, token);
  }

  async cancelByHost(
    hostUserId: string,
    bookingId: string,
    expectedSequence: number,
    reason?: string
  ): Promise<BookingResponse> {
    return this.cancelBooking(bookingId, expectedSequence, reason, BookingActor.HOST, hostUserId, undefined);
  }

  async rescheduleByHost(
    hostUserId: string,
    bookingId: string,
    dto: RescheduleBookingBody
  ): Promise<BookingResponse> {
    return this.rescheduleBooking(bookingId, dto, BookingActor.HOST, hostUserId, undefined);
  }

  async getIcsContent(
    bookingId: string,
    token: string | undefined
  ): Promise<{ filename: string; content: string }> {
    return this.getBookingIcs(bookingId, token || "");
  }

  async deleteByHost(hostUserId: string, bookingId: string): Promise<{ success: boolean }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking || booking.hostId !== hostUserId) {
      throw new NotFoundError("Booking not found or this link is no longer valid.");
    }

    if (booking.status !== "CANCELLED") {
      throw new BadRequestError(
        "CANNOT_DELETE_ACTIVE_BOOKING",
        "Only cancelled bookings can be deleted from history."
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationJob.deleteMany({ where: { bookingId } });
      await tx.calendarSyncJob.deleteMany({ where: { bookingId } });
      await tx.externalCalendarEvent.deleteMany({ where: { bookingId } });
      await tx.bookingRescheduleHistory.deleteMany({ where: { bookingId } });
      await tx.booking.delete({ where: { id: bookingId } });
    }, { maxWait: 15000, timeout: 25000 });

    return { success: true };
  }

  async updateAttendeeEmail(hostUserId: string, bookingId: string, newEmail: string): Promise<BookingResponse> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        eventType: true,
        host: true,
      },
    });

    if (!booking || booking.hostId !== hostUserId) {
      throw new NotFoundError("Booking not found or this link is no longer valid.");
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { attendeeEmail: newEmail.trim().toLowerCase() },
      include: {
        eventType: true,
        host: true,
      },
    });

    return this.mapToResponse(updated);
  }

  private mapToResponse(row: {
    id: string;
    eventTypeId: string;
    hostId: string;
    startTime: Date;
    endTime: Date;
    status: string;
    sequence: number;
    rescheduleCount: number;
    rescheduledAt: Date | null;
    rescheduledBy: BookingActor | null;
    rescheduleReason: string | null;
    previousStartTime: Date | null;
    previousEndTime: Date | null;
    attendeeName: string;
    attendeeEmail: string;
    attendeeTimeZone: string;
    attendeePhoneNumber?: string | null;
    attendeeNotes: string;
    locationType?: LocationType | null;
    locationData?: unknown | null;
    customResponses?: unknown | null;
    cancellationReason: string | null;
    cancelledAt: Date | null;
    cancelledBy: BookingActor | null;
    createdAt: Date;
    eventType: {
      id: string;
      title: string;
      slug: string;
      durationMinutes: number;
    };
    host: {
      id: string;
      name: string;
      username: string;
      timezone: string;
    };
  }): BookingResponse {
    return {
      id: row.id,
      eventTypeId: row.eventTypeId,
      hostId: row.hostId,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      status: row.status,
      sequence: row.sequence,
      rescheduleCount: row.rescheduleCount,
      rescheduledAt: row.rescheduledAt?.toISOString() ?? null,
      rescheduledBy: row.rescheduledBy,
      rescheduleReason: row.rescheduleReason,
      previousStartTime: row.previousStartTime?.toISOString() ?? null,
      previousEndTime: row.previousEndTime?.toISOString() ?? null,
      attendeeName: row.attendeeName,
      attendeeEmail: row.attendeeEmail,
      attendeeTimeZone: row.attendeeTimeZone,
      attendeePhoneNumber: row.attendeePhoneNumber ?? null,
      attendeeNotes: row.attendeeNotes,
      location: parseBookingLocation(row.locationType, row.locationData),
      customResponses: parseStoredBookingCustomResponses(row.customResponses),
      cancellationReason: row.cancellationReason,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelledBy: row.cancelledBy,
      createdAt: row.createdAt.toISOString(),
      eventType: {
        id: row.eventType.id,
        title: row.eventType.title,
        slug: row.eventType.slug,
        durationMinutes: row.eventType.durationMinutes,
      },
      host: {
        id: row.host.id,
        name: row.host.name,
        username: row.host.username,
        timezone: row.host.timezone,
      },
    };
  }
}
