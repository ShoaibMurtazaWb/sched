import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { CalendarSyncJob } from "@prisma/client";
import {
  CalendarIntegrationStatus,
  CalendarProviderType,
  CalendarSyncJobStatus,
  CalendarSyncStatus,
} from "@prisma/client";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { parseBookingLocation } from "../../shared/utils/location-parser";
import type { CalendarProvider } from "../interfaces/calendar-provider.interface";
import { CALENDAR_PROVIDER } from "../interfaces/calendar-provider.interface";
import { GoogleAuthRevokedError } from "../providers/google-calendar.provider";
import { GoogleCalendarService } from "./google-calendar.service";

@Injectable()
export class CalendarSyncProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("CalendarSyncProcessor");
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendarService: GoogleCalendarService,
    @Inject(CALENDAR_PROVIDER) private readonly calendarProvider: CalendarProvider
  ) {}

  onModuleInit() {
    const isTest = process.env.NODE_ENV === "test";
    if (!isTest) {
      this.intervalTimer = setInterval(() => {
        void this.processPendingJobs().catch((err) => {
          this.logger.error("Error in scheduled calendar sync sweep", err);
        });
      }, 3000);
      this.logger.log("Calendar sync background processor initialized.");
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

    const result = await this.prisma.calendarSyncJob.updateMany({
      where: {
        status: CalendarSyncJobStatus.PROCESSING,
        lockedAt: { lt: cutoff },
      },
      data: {
        status: CalendarSyncJobStatus.PENDING,
        lockedAt: null,
        lastError: "Worker timeout: stale processing lock recovered",
      },
    });

    if (result.count > 0) {
      this.logger.warn(`Recovered ${result.count} stale PROCESSING calendar sync jobs.`);
    }

    return result.count;
  }

  /**
   * Concurrency-safe atomic job claiming using PostgreSQL SKIP LOCKED with CTE.
   */
  async claimPendingJobs(limit = 10): Promise<CalendarSyncJob[]> {
    const claimedRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        bookingId: string;
        integrationId: string;
        calendarId: string;
        sequence: number;
        status: CalendarSyncJobStatus;
        attempts: number;
        maxAttempts: number;
        nextRunAt: Date;
        lockedAt: Date | null;
        completedAt: Date | null;
        lastError: string | null;
        payload: unknown;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      WITH claimed AS (
        SELECT id FROM calendar_sync_jobs
        WHERE status = 'PENDING'::"CalendarSyncJobStatus"
          AND next_run_at <= NOW()
        ORDER BY next_run_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE calendar_sync_jobs
      SET status = 'PROCESSING'::"CalendarSyncJobStatus",
          locked_at = NOW()
      WHERE id IN (SELECT id FROM claimed)
      RETURNING
        id,
        booking_id AS "bookingId",
        integration_id AS "integrationId",
        calendar_id AS "calendarId",
        sequence,
        status,
        attempts,
        max_attempts AS "maxAttempts",
        next_run_at AS "nextRunAt",
        locked_at AS "lockedAt",
        completed_at AS "completedAt",
        last_error AS "lastError",
        payload,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    return claimedRows as unknown as CalendarSyncJob[];
  }

  /**
   * Main worker execution loop.
   */
  async processPendingJobs(limit = 10): Promise<{ processed: number; success: number; failed: number }> {
    if (this.isProcessing) {
      return { processed: 0, success: 0, failed: 0 };
    }

    this.isProcessing = true;
    let successCount = 0;
    let failedCount = 0;

    try {
      await this.recoverStaleJobs(5);
      const jobs = await this.claimPendingJobs(limit);

      for (const job of jobs) {
        try {
          await this.syncJob(job);
          successCount++;
        } catch (syncErr) {
          failedCount++;
          await this.handleJobFailure(job, syncErr);
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

  /**
   * Executes desired-state synchronization for a claimed job.
   */
  async syncJob(job: CalendarSyncJob): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: job.bookingId },
      include: {
        eventType: true,
        host: true,
      },
    });

    if (!booking) {
      // Booking no longer exists
      await this.markJobCompleted(job.id);
      return;
    }

    // Sequence Check: If job sequence is older than current booking sequence, it's stale and safe to complete
    if (job.sequence < booking.sequence) {
      this.logger.log(
        `CalendarSyncJob ${job.id} sequence (${job.sequence}) is older than current booking sequence (${booking.sequence}). Skipping as no-op.`
      );
      await this.markJobCompleted(job.id);
      return;
    }

    const integration = await this.prisma.calendarIntegration.findUnique({
      where: { id: job.integrationId },
    });

    if (!integration || integration.status !== CalendarIntegrationStatus.CONNECTED) {
      this.logger.log(
        `CalendarIntegration ${job.integrationId} is not connected. Skipping sync for booking ${booking.id}.`
      );
      await this.markJobCompleted(job.id);
      return;
    }

    const credentials = await this.googleCalendarService.getValidCredentials(integration);

    // Deterministic base32hex/Google-compatible event ID: 'sched' + 32-character hex (no hyphens, no underscores)
    const externalEventId = `sched${booking.id.replace(/-/g, "").toLowerCase()}`;

    if (booking.status === "CANCELLED") {
      // Cancellation synchronization: Delete the Google Calendar event
      await this.calendarProvider.deleteEvent(credentials, job.calendarId, externalEventId, "none");

      // Update external calendar event record
      await this.prisma.externalCalendarEvent.updateMany({
        where: { bookingId: booking.id, integrationId: integration.id },
        data: {
          lastSyncedSequence: job.sequence,
          syncStatus: CalendarSyncStatus.SYNCED,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
    } else {
      // Confirmed / Rescheduled synchronization
      const location = parseBookingLocation(booking.locationType, booking.locationData);
      let locationStr: string | undefined;
      let zoomDetails = "";

      if (location?.data) {
        const d = location.data as Record<string, unknown>;
        if (typeof d["joinUrl"] === "string" && d["joinUrl"]) {
          locationStr = d["joinUrl"];
          zoomDetails = `\n\nJoin Zoom Meeting: ${d["joinUrl"]}`;
          if (d["meetingId"]) zoomDetails += `\nMeeting ID: ${d["meetingId"]}`;
          if (d["password"]) zoomDetails += `\nPasscode: ${d["password"]}`;
        } else if (typeof d["address"] === "string" && d["address"]) {
          locationStr = d["address"];
        } else if (typeof d["customUrl"] === "string" && d["customUrl"]) {
          locationStr = d["customUrl"];
        } else if (typeof d["staticVideoUrl"] === "string" && d["staticVideoUrl"]) {
          locationStr = d["staticVideoUrl"];
        } else if (typeof d["hostPhoneNumber"] === "string" && d["hostPhoneNumber"]) {
          locationStr = d["hostPhoneNumber"];
        } else if (booking.attendeePhoneNumber) {
          locationStr = booking.attendeePhoneNumber;
        }
      }

      await this.calendarProvider.syncEvent(credentials, {
        calendarId: job.calendarId,
        externalEventId,
        booking: {
          id: booking.id,
          sequence: booking.sequence,
          title: booking.eventType.title,
          description: `Booking with ${booking.attendeeName} (${booking.attendeeEmail})\n\nNotes: ${
            booking.attendeeNotes || "None"
          }${zoomDetails}`,
          location: locationStr,
          startTime: booking.startTime,
          endTime: booking.endTime,
          attendeeName: booking.attendeeName,
          attendeeEmail: booking.attendeeEmail,
          status: "CONFIRMED",
        },
        sendUpdates: "none",
      });

      // Upsert ExternalCalendarEvent mapping record
      await this.prisma.externalCalendarEvent.upsert({
        where: {
          bookingId_integrationId: {
            bookingId: booking.id,
            integrationId: integration.id,
          },
        },
        create: {
          bookingId: booking.id,
          integrationId: integration.id,
          provider: CalendarProviderType.GOOGLE,
          calendarId: job.calendarId,
          externalEventId,
          lastSyncedSequence: job.sequence,
          syncStatus: CalendarSyncStatus.SYNCED,
          lastSyncedAt: new Date(),
        },
        update: {
          calendarId: job.calendarId,
          externalEventId,
          lastSyncedSequence: job.sequence,
          syncStatus: CalendarSyncStatus.SYNCED,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
    }

    await this.markJobCompleted(job.id);
    this.logger.log(
      `Successfully reconciled CalendarSyncJob ${job.id} for booking ${booking.id} (sequence ${job.sequence}).`
    );
  }

  private async markJobCompleted(jobId: string): Promise<void> {
    await this.prisma.calendarSyncJob.update({
      where: { id: jobId },
      data: {
        status: CalendarSyncJobStatus.COMPLETED,
        completedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }

  private async handleJobFailure(job: CalendarSyncJob, err: unknown): Promise<void> {
    const attempts = job.attempts + 1;
    const isRevoked = err instanceof GoogleAuthRevokedError;
    const isExhausted = attempts >= job.maxAttempts || isRevoked;
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (isRevoked) {
      await this.googleCalendarService.markRevokedAndClearSecrets(job.integrationId);
    }

    const backoffMs = Math.min(60000, 2 ** attempts * 2000);
    const nextRunAt = new Date(Date.now() + backoffMs);

    await this.prisma.calendarSyncJob.update({
      where: { id: job.id },
      data: {
        status: isExhausted ? CalendarSyncJobStatus.DEAD_LETTER : CalendarSyncJobStatus.PENDING,
        attempts,
        nextRunAt: isExhausted ? job.nextRunAt : nextRunAt,
        lockedAt: null,
        lastError: errorMsg,
      },
    });

    // Also update ExternalCalendarEvent status if mapping exists
    await this.prisma.externalCalendarEvent.updateMany({
      where: { bookingId: job.bookingId, integrationId: job.integrationId },
      data: {
        syncStatus: CalendarSyncStatus.FAILED,
        lastError: errorMsg,
      },
    });

    if (isExhausted) {
      this.logger.error(
        JSON.stringify({
          event: "WORKER_DEAD_LETTER",
          worker: "CalendarSyncProcessor",
          jobId: job.id,
          bookingId: job.bookingId,
          integrationId: job.integrationId,
          attempts: `${attempts}/${job.maxAttempts}`,
          error: errorMsg,
        })
      );
    } else {
      this.logger.warn(
        JSON.stringify({
          event: "WORKER_RETRY_SCHEDULED",
          worker: "CalendarSyncProcessor",
          jobId: job.id,
          bookingId: job.bookingId,
          integrationId: job.integrationId,
          attempts: `${attempts}/${job.maxAttempts}`,
          nextRetryInSeconds: Math.round(backoffMs / 1000),
          nextRunAt: nextRunAt.toISOString(),
          error: errorMsg,
        })
      );
    }
  }
}
