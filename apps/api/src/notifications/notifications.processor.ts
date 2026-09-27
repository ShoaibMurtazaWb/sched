import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NotificationJob } from "@prisma/client";
import { NotificationStatus, NotificationType } from "@prisma/client";
import { PrismaService } from "../shared/prisma/prisma.service";
import { BookingTokenService } from "../shared/services/booking-token.service";
import { EMAIL_PROVIDER, type EmailProvider } from "./interfaces/email-provider.interface";
import {
  renderBookingCancelledAttendee,
  renderBookingCancelledHost,
  renderBookingConfirmedAttendee,
  renderBookingConfirmedHost,
  renderBookingReminderAttendee,
  renderBookingRescheduledAttendee,
  renderBookingRescheduledHost,
  type SnapshotPayload,
} from "./templates/email-templates";
import { generateIcsCalendar } from "../shared/utils/ics-formatter";

@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("NotificationsProcessor");
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: BookingTokenService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider
  ) {
    this.appUrl = this.config.get<string>("APP_URL", "http://localhost:3000");
  }

  onModuleInit() {
    const isTest = process.env.NODE_ENV === "test";
    if (!isTest) {
      // Sweep every 3 seconds in dev/prod
      this.intervalTimer = setInterval(() => {
        void this.processPendingJobs().catch((err) => {
          this.logger.error("Error in scheduled notification sweep", err);
        });
      }, 3000);
      this.logger.log("Notification background processor initialized.");
    }
  }

  onModuleDestroy() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Recovers jobs that were left in PROCESSING state due to a worker crash or timeout.
   */
  async recoverStaleJobs(staleMinutes = 5): Promise<number> {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);

    const result = await this.prisma.notificationJob.updateMany({
      where: {
        status: NotificationStatus.PROCESSING,
        lockedAt: { lt: cutoff },
      },
      data: {
        status: NotificationStatus.PENDING,
        lockedAt: null,
        lastError: "Worker timeout: stale processing lock recovered",
      },
    });

    if (result.count > 0) {
      this.logger.warn(`Recovered ${result.count} stale PROCESSING notification jobs.`);
    }

    return result.count;
  }

  /**
   * Concurrency-safe, atomic job claiming using PostgreSQL SKIP LOCKED with CTE.
   */
  async claimPendingJobs(limit = 10): Promise<NotificationJob[]> {
    const claimedRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        idempotencyKey: string;
        bookingId: string;
        type: NotificationType;
        recipientEmail: string;
        status: NotificationStatus;
        attempts: number;
        maxAttempts: number;
        nextRunAt: Date;
        lockedAt: Date | null;
        sentAt: Date | null;
        lastError: string | null;
        payload: unknown;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      WITH claimed AS (
        SELECT id FROM notification_jobs
        WHERE status = 'PENDING'::"NotificationStatus"
          AND next_run_at <= NOW()
        ORDER BY next_run_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notification_jobs
      SET status = 'PROCESSING'::"NotificationStatus",
          locked_at = NOW()
      WHERE id IN (SELECT id FROM claimed)
      RETURNING
        id,
        idempotency_key AS "idempotencyKey",
        booking_id AS "bookingId",
        type,
        recipient_email AS "recipientEmail",
        status,
        attempts,
        max_attempts AS "maxAttempts",
        next_run_at AS "nextRunAt",
        locked_at AS "lockedAt",
        sent_at AS "sentAt",
        last_error AS "lastError",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    return claimedRows as unknown as NotificationJob[];
  }

  /**
   * Main worker execution method.
   */
  async processPendingJobs(limit = 10): Promise<{ processed: number; success: number; failed: number }> {
    if (this.isProcessing) {
      return { processed: 0, success: 0, failed: 0 };
    }

    this.isProcessing = true;
    let successCount = 0;
    let failedCount = 0;

    try {
      // Step 1: Recover any stale locks
      await this.recoverStaleJobs(5);

      // Step 2: Claim batch of pending jobs
      const jobs = await this.claimPendingJobs(limit);

      for (const job of jobs) {
        try {
          await this.deliverJob(job);
          successCount++;
        } catch (deliveryErr) {
          failedCount++;
          await this.handleJobFailure(job, deliveryErr);
        }
      }

      return {
        processed: jobs.length,
        success: successCount,
        failed: failedCount,
      };
    } finally {
      this.isProcessing = false;
    }
  }

  private async deliverJob(job: NotificationJob): Promise<void> {
    const snapshot = job.payload as unknown as SnapshotPayload;
    let subject = "";
    let html = "";
    let text = "";
    let attachments: Array<{ filename: string; content: string; contentType: string }> | undefined;

    // Construct stateless signed attendee management capability URL
    const manageUrl = this.tokenService.generateManagementUrl(
      this.appUrl,
      snapshot.bookingId,
      snapshot.tokenVersion || 1
    );

    switch (job.type) {
      case NotificationType.BOOKING_CONFIRMED_ATTENDEE: {
        const rendered = renderBookingConfirmedAttendee(snapshot, manageUrl);
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;

        // Generate attached .ics calendar invite
        const ics = this.buildIcsContent(snapshot, "REQUEST");
        attachments = [
          {
            filename: `${snapshot.eventSlug}-${snapshot.bookingId.slice(0, 8)}.ics`,
            content: ics,
            contentType: "text/calendar; charset=utf-8; method=REQUEST",
          },
        ];
        break;
      }
      case NotificationType.BOOKING_CONFIRMED_HOST: {
        const rendered = renderBookingConfirmedHost(snapshot, this.appUrl, manageUrl);
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;

        // Generate attached .ics calendar invite for host
        const ics = this.buildIcsContent(snapshot, "REQUEST");
        attachments = [
          {
            filename: `${snapshot.eventSlug}-${snapshot.bookingId.slice(0, 8)}.ics`,
            content: ics,
            contentType: "text/calendar; charset=utf-8; method=REQUEST",
          },
        ];
        break;
      }
      case NotificationType.BOOKING_RESCHEDULED_ATTENDEE: {
        const rendered = renderBookingRescheduledAttendee(snapshot, manageUrl);
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;

        // Generate updated .ics calendar invite with incremented SEQUENCE
        const ics = this.buildIcsContent(snapshot, "REQUEST");
        attachments = [
          {
            filename: `${snapshot.eventSlug}-${snapshot.bookingId.slice(0, 8)}-v${snapshot.sequence}.ics`,
            content: ics,
            contentType: "text/calendar; charset=utf-8; method=REQUEST",
          },
        ];
        break;
      }
      case NotificationType.BOOKING_RESCHEDULED_HOST: {
        const rendered = renderBookingRescheduledHost(snapshot, this.appUrl, manageUrl);
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;

        // Generate updated .ics calendar invite with incremented SEQUENCE for host
        const ics = this.buildIcsContent(snapshot, "REQUEST");
        attachments = [
          {
            filename: `${snapshot.eventSlug}-${snapshot.bookingId.slice(0, 8)}-v${snapshot.sequence}.ics`,
            content: ics,
            contentType: "text/calendar; charset=utf-8; method=REQUEST",
          },
        ];
        break;
      }
      case NotificationType.BOOKING_CANCELLED_ATTENDEE: {
        const rendered = renderBookingCancelledAttendee(snapshot, this.appUrl);
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;

        // Cancellation .ics invite
        const ics = this.buildIcsContent(snapshot, "CANCEL");
        attachments = [
          {
            filename: `${snapshot.eventSlug}-${snapshot.bookingId.slice(0, 8)}-cancelled.ics`,
            content: ics,
            contentType: "text/calendar; charset=utf-8; method=CANCEL",
          },
        ];
        break;
      }
      case NotificationType.BOOKING_CANCELLED_HOST: {
        const rendered = renderBookingCancelledHost(snapshot, this.appUrl);
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;
        break;
      }
      case NotificationType.BOOKING_REMINDER_24H: {
        // Pre-check if booking is still confirmed
        const currentBooking = await this.prisma.booking.findUnique({
          where: { id: job.bookingId },
          select: { status: true },
        });
        if (!currentBooking || currentBooking.status !== "CONFIRMED") {
          await this.prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: NotificationStatus.CANCELLED,
              lockedAt: null,
              lastError: "Skipped: booking is not in CONFIRMED state",
            },
          });
          this.logger.log(`Cancelled reminder job ${job.id}: booking is ${currentBooking?.status || "missing"}`);
          return;
        }

        const rendered = renderBookingReminderAttendee(snapshot, manageUrl, "in 24 hours");
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;
        break;
      }
      case NotificationType.BOOKING_REMINDER_1H: {
        // Pre-check if booking is still confirmed
        const currentBooking = await this.prisma.booking.findUnique({
          where: { id: job.bookingId },
          select: { status: true },
        });
        if (!currentBooking || currentBooking.status !== "CONFIRMED") {
          await this.prisma.notificationJob.update({
            where: { id: job.id },
            data: {
              status: NotificationStatus.CANCELLED,
              lockedAt: null,
              lastError: "Skipped: booking is not in CONFIRMED state",
            },
          });
          this.logger.log(`Cancelled reminder job ${job.id}: booking is ${currentBooking?.status || "missing"}`);
          return;
        }

        const rendered = renderBookingReminderAttendee(snapshot, manageUrl, "in 1 hour");
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;
        break;
      }
      default:
        throw new Error(`Unknown notification type: ${job.type}`);
    }

    // Deliver through configured provider with idempotency key
    await this.emailProvider.send({
      to: job.recipientEmail,
      subject,
      html,
      text,
      attachments,
      idempotencyKey: job.idempotencyKey,
    });

    // Mark as SENT
    await this.prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });

    this.logger.log(`Delivered notification job ${job.id} (${job.type}) to ${job.recipientEmail}`);
  }

  private async handleJobFailure(job: NotificationJob, err: unknown): Promise<void> {
    const attempts = job.attempts + 1;
    const isExhausted = attempts >= job.maxAttempts;
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Exponential backoff: 2s, 4s, 8s... up to 60s
    const backoffMs = Math.min(60000, 2 ** attempts * 2000);
    const nextRunAt = new Date(Date.now() + backoffMs);

    await this.prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: isExhausted ? NotificationStatus.DEAD_LETTER : NotificationStatus.PENDING,
        attempts,
        nextRunAt: isExhausted ? job.nextRunAt : nextRunAt,
        lockedAt: null,
        lastError: errorMsg,
      },
    });

    if (isExhausted) {
      this.logger.error(
        JSON.stringify({
          event: "WORKER_DEAD_LETTER",
          worker: "NotificationsProcessor",
          jobId: job.id,
          bookingId: job.bookingId,
          recipientEmail: job.recipientEmail,
          attempts: `${attempts}/${job.maxAttempts}`,
          error: errorMsg,
        })
      );
    } else {
      this.logger.warn(
        JSON.stringify({
          event: "WORKER_RETRY_SCHEDULED",
          worker: "NotificationsProcessor",
          jobId: job.id,
          bookingId: job.bookingId,
          attempts: `${attempts}/${job.maxAttempts}`,
          nextRetryInSeconds: Math.round(backoffMs / 1000),
          nextRunAt: nextRunAt.toISOString(),
          error: errorMsg,
        })
      );
    }
  }

  private buildIcsContent(snapshot: SnapshotPayload, method: "REQUEST" | "CANCEL" = "REQUEST"): string {
    return generateIcsCalendar({
      uid: `${snapshot.bookingId}@sched.com`,
      sequence: snapshot.sequence || 0,
      dtstamp: new Date(),
      startTime: new Date(snapshot.startUtc),
      endTime: new Date(snapshot.endUtc),
      summary: `${snapshot.eventTitle} with ${snapshot.hostName}`,
      description: `Meeting between ${snapshot.hostName} and ${snapshot.attendeeName}\n\nNotes: ${
        snapshot.attendeeNotes || "None"
      }`,
      status: method === "CANCEL" || snapshot.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
      locationType: snapshot.locationType,
      locationData: snapshot.locationData,
      attendeePhoneNumber: snapshot.attendeePhoneNumber,
      hostName: snapshot.hostName,
      attendeeName: snapshot.attendeeName,
    });
  }
}
