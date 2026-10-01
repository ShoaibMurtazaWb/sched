import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import { NotificationType, NotificationStatus, BookingActor, LocationType } from "@prisma/client";
import { EMAIL_PROVIDER, type EmailProvider } from "./interfaces/email-provider.interface";
import {
  renderWelcomeVerificationEmail,
  renderLoginSecurityAlertEmail,
  renderEmailVerificationEmail,
  renderPasswordResetEmail,
  renderEmailChangeConfirmationEmail,
  type SnapshotPayload,
} from "./templates/email-templates";

export interface BookingWithDetails {
  id: string;
  eventTypeId: string;
  hostId: string;
  startTime: Date;
  endTime: Date;
  status: string;
  sequence: number;
  tokenVersion: number;
  attendeeName: string;
  attendeeEmail: string;
  attendeeTimeZone: string;
  attendeePhoneNumber?: string | null;
  attendeeNotes?: string | null;
  locationType?: LocationType | null;
  locationData?: unknown | null;
  customResponses?: unknown | null;
  cancellationReason?: string | null;
  cancelledBy?: BookingActor | null;
  previousStartTime?: Date | null;
  previousEndTime?: Date | null;
  rescheduleReason?: string | null;
  rescheduledBy?: BookingActor | null;
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
    email: string;
    timezone: string;
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger("NotificationsService");
  private readonly appUrl: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider
  ) {
    this.appUrl = this.config.get<string>("APP_URL", "http://localhost:3000");
  }

  private buildSnapshot(booking: BookingWithDetails): SnapshotPayload {
    return {
      bookingId: booking.id,
      eventTypeId: booking.eventType.id,
      eventTitle: booking.eventType.title,
      eventSlug: booking.eventType.slug,
      durationMinutes: booking.eventType.durationMinutes,
      hostId: booking.host.id,
      hostName: booking.host.name,
      hostUsername: booking.host.username,
      hostEmail: booking.host.email,
      hostTimeZone: booking.host.timezone,
      attendeeName: booking.attendeeName,
      attendeeEmail: booking.attendeeEmail,
      attendeeTimeZone: booking.attendeeTimeZone,
      attendeePhoneNumber: booking.attendeePhoneNumber ?? null,
      attendeeNotes: booking.attendeeNotes ?? "",
      locationType: booking.locationType ?? null,
      locationData: (booking.locationData as Record<string, unknown>) ?? null,
      customResponses: (booking.customResponses as SnapshotPayload["customResponses"]) ?? null,
      startUtc: booking.startTime.toISOString(),
      endUtc: booking.endTime.toISOString(),
      status: booking.status,
      sequence: booking.sequence,
      tokenVersion: booking.tokenVersion,
      cancellationReason: booking.cancellationReason ?? null,
      cancelledBy: booking.cancelledBy ?? null,
      previousStartUtc: booking.previousStartTime ? booking.previousStartTime.toISOString() : null,
      previousEndUtc: booking.previousEndTime ? booking.previousEndTime.toISOString() : null,
      rescheduleReason: booking.rescheduleReason ?? null,
      rescheduledBy: booking.rescheduledBy ?? null,
    };
  }

  async enqueueConfirmationJobsInTx(
    tx: Prisma.TransactionClient,
    booking: BookingWithDetails
  ): Promise<void> {
    const snapshot = this.buildSnapshot(booking);

    // 1. Attendee confirmation job
    await tx.notificationJob.upsert({
      where: { idempotencyKey: `booking:${booking.id}:confirmed:${booking.sequence}:attendee` },
      update: {},
      create: {
        bookingId: booking.id,
        idempotencyKey: `booking:${booking.id}:confirmed:${booking.sequence}:attendee`,
        type: NotificationType.BOOKING_CONFIRMED_ATTENDEE,
        recipientEmail: booking.attendeeEmail,
        status: NotificationStatus.PENDING,
        payload: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    // 2. Host new booking alert job
    await tx.notificationJob.upsert({
      where: { idempotencyKey: `booking:${booking.id}:confirmed:${booking.sequence}:host` },
      update: {},
      create: {
        bookingId: booking.id,
        idempotencyKey: `booking:${booking.id}:confirmed:${booking.sequence}:host`,
        type: NotificationType.BOOKING_CONFIRMED_HOST,
        recipientEmail: booking.host.email,
        status: NotificationStatus.PENDING,
        payload: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Enqueued confirmation outbox jobs for booking ${booking.id} (sequence ${booking.sequence})`);
  }

  async enqueueRescheduleJobsInTx(
    tx: Prisma.TransactionClient,
    booking: BookingWithDetails
  ): Promise<void> {
    const snapshot = this.buildSnapshot(booking);

    // 1. Attendee reschedule notification job
    await tx.notificationJob.upsert({
      where: { idempotencyKey: `booking:${booking.id}:rescheduled:${booking.sequence}:attendee` },
      update: {},
      create: {
        bookingId: booking.id,
        idempotencyKey: `booking:${booking.id}:rescheduled:${booking.sequence}:attendee`,
        type: NotificationType.BOOKING_RESCHEDULED_ATTENDEE,
        recipientEmail: booking.attendeeEmail,
        status: NotificationStatus.PENDING,
        payload: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    // 2. Host reschedule notification job
    await tx.notificationJob.upsert({
      where: { idempotencyKey: `booking:${booking.id}:rescheduled:${booking.sequence}:host` },
      update: {},
      create: {
        bookingId: booking.id,
        idempotencyKey: `booking:${booking.id}:rescheduled:${booking.sequence}:host`,
        type: NotificationType.BOOKING_RESCHEDULED_HOST,
        recipientEmail: booking.host.email,
        status: NotificationStatus.PENDING,
        payload: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Enqueued reschedule outbox jobs for booking ${booking.id} (sequence ${booking.sequence})`);
  }

  async enqueueCancellationJobsInTx(
    tx: Prisma.TransactionClient,
    booking: BookingWithDetails
  ): Promise<void> {
    const snapshot = this.buildSnapshot(booking);

    if (booking.cancelledBy === BookingActor.HOST) {
      // Host cancelled -> Notify attendee
      await tx.notificationJob.upsert({
        where: { idempotencyKey: `booking:${booking.id}:cancelled:${booking.sequence}:attendee` },
        update: {},
        create: {
          bookingId: booking.id,
          idempotencyKey: `booking:${booking.id}:cancelled:${booking.sequence}:attendee`,
          type: NotificationType.BOOKING_CANCELLED_ATTENDEE,
          recipientEmail: booking.attendeeEmail,
          status: NotificationStatus.PENDING,
          payload: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
    } else {
      // Attendee cancelled -> Notify host
      await tx.notificationJob.upsert({
        where: { idempotencyKey: `booking:${booking.id}:cancelled:${booking.sequence}:host` },
        update: {},
        create: {
          bookingId: booking.id,
          idempotencyKey: `booking:${booking.id}:cancelled:${booking.sequence}:host`,
          type: NotificationType.BOOKING_CANCELLED_HOST,
          recipientEmail: booking.host.email,
          status: NotificationStatus.PENDING,
          payload: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
    }

    this.logger.log(`Enqueued cancellation outbox job for booking ${booking.id} (sequence ${booking.sequence})`);
  }

  async enqueueReminderJobsInTx(
    tx: Prisma.TransactionClient,
    booking: BookingWithDetails,
    now: Date = new Date()
  ): Promise<void> {
    if (booking.status !== "CONFIRMED") return;

    const snapshot = this.buildSnapshot(booking);
    const startTimeMs = booking.startTime.getTime();
    const nowMs = now.getTime();

    // 1. 24-Hour Pre-Meeting Reminder
    const reminder24hTime = new Date(startTimeMs - 24 * 60 * 60 * 1000);
    if (reminder24hTime.getTime() > nowMs) {
      await tx.notificationJob.upsert({
        where: { idempotencyKey: `booking:${booking.id}:reminder-24h:${booking.sequence}:attendee` },
        update: {},
        create: {
          bookingId: booking.id,
          idempotencyKey: `booking:${booking.id}:reminder-24h:${booking.sequence}:attendee`,
          type: NotificationType.BOOKING_REMINDER_24H,
          recipientEmail: booking.attendeeEmail,
          status: NotificationStatus.PENDING,
          nextRunAt: reminder24hTime,
          payload: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.log(
        `Scheduled 24h reminder for booking ${booking.id} at ${reminder24hTime.toISOString()}`
      );
    }

    // 2. 1-Hour Pre-Meeting Reminder
    const reminder1hTime = new Date(startTimeMs - 60 * 60 * 1000);
    if (reminder1hTime.getTime() > nowMs) {
      await tx.notificationJob.upsert({
        where: { idempotencyKey: `booking:${booking.id}:reminder-1h:${booking.sequence}:attendee` },
        update: {},
        create: {
          bookingId: booking.id,
          idempotencyKey: `booking:${booking.id}:reminder-1h:${booking.sequence}:attendee`,
          type: NotificationType.BOOKING_REMINDER_1H,
          recipientEmail: booking.attendeeEmail,
          status: NotificationStatus.PENDING,
          nextRunAt: reminder1hTime,
          payload: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.log(
        `Scheduled 1h reminder for booking ${booking.id} at ${reminder1hTime.toISOString()}`
      );
    }
  }

  async cancelPendingReminderJobsInTx(
    tx: Prisma.TransactionClient,
    bookingId: string
  ): Promise<number> {
    const result = await tx.notificationJob.updateMany({
      where: {
        bookingId,
        status: NotificationStatus.PENDING,
        type: {
          in: [NotificationType.BOOKING_REMINDER_24H, NotificationType.BOOKING_REMINDER_1H],
        },
      },
      data: {
        status: NotificationStatus.CANCELLED,
        lastError: "Cancelled due to booking state change (rescheduled/cancelled)",
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cancelled ${result.count} pending reminder jobs for booking ${bookingId}`);
    }

    return result.count;
  }

  async sendWelcomeVerificationEmail(user: {
    id: string;
    name: string;
    email: string;
    username: string;
  }): Promise<void> {
    try {
      const { subject, html, text } = renderWelcomeVerificationEmail(user, this.appUrl);
      await this.emailProvider.send({
        to: user.email,
        subject,
        html,
        text,
        idempotencyKey: `user:${user.id}:welcome`,
      });
      this.logger.log(`Welcome/Verification email sent to user ${user.email} (${user.id})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send welcome email to ${user.email}: ${errMsg}`);
    }
  }

  async sendLoginSecurityAlertEmail(
    user: { id: string; name: string; email: string },
    details?: { timeIso?: string; userAgent?: string; ip?: string }
  ): Promise<void> {
    try {
      const loginInfo = {
        timeIso: details?.timeIso || new Date().toISOString(),
        ip: details?.ip,
        userAgent: details?.userAgent,
      };
      const { subject, html, text } = renderLoginSecurityAlertEmail(user, loginInfo, this.appUrl);
      await this.emailProvider.send({
        to: user.email,
        subject,
        html,
        text,
      });
      this.logger.log(`Login security alert email sent to user ${user.email} (${user.id})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send login alert email to ${user.email}: ${errMsg}`);
    }
  }

  async sendEmailVerificationEmail(
    user: { id: string; name: string; email: string },
    rawToken: string
  ): Promise<void> {
    try {
      const verifyUrl = `${this.appUrl}/auth/verify-email?token=${rawToken}`;
      const { subject, html, text } = renderEmailVerificationEmail(user, verifyUrl);
      await this.emailProvider.send({
        to: user.email,
        subject,
        html,
        text,
      });
      this.logger.log(`Email verification sent to ${user.email} (${user.id})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email verification to ${user.email}: ${errMsg}`);
    }
  }

  async sendPasswordResetEmail(
    user: { id: string; name: string; email: string },
    rawToken: string
  ): Promise<void> {
    try {
      const resetUrl = `${this.appUrl}/auth/reset-password?token=${rawToken}`;
      const { subject, html, text } = renderPasswordResetEmail(user, resetUrl);
      await this.emailProvider.send({
        to: user.email,
        subject,
        html,
        text,
      });
      this.logger.log(`Password reset email sent to ${user.email} (${user.id})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send password reset email to ${user.email}: ${errMsg}`);
    }
  }

  async sendEmailChangeConfirmationEmail(
    user: { id: string; name: string; currentEmail: string },
    newEmail: string,
    rawToken: string
  ): Promise<void> {
    try {
      const confirmUrl = `${this.appUrl}/auth/change-email/confirm?token=${rawToken}`;
      const { subject, html, text } = renderEmailChangeConfirmationEmail(user, newEmail, confirmUrl);
      await this.emailProvider.send({
        to: newEmail,
        subject,
        html,
        text,
      });
      this.logger.log(`Email change confirmation sent to new email ${newEmail} for user ${user.id}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email change confirmation to ${newEmail}: ${errMsg}`);
    }
  }
}
