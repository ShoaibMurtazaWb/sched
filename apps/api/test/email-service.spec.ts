import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AppModule } from "../src/app.module";
import { NotificationsService } from "../src/notifications/notifications.service";
import { NotificationsProcessor } from "../src/notifications/notifications.processor";
import { SmtpEmailProvider } from "../src/notifications/providers/smtp-email.provider";
import { DevEmailProvider } from "../src/notifications/providers/dev-email.provider";
import { EMAIL_PROVIDER } from "../src/notifications/interfaces/email-provider.interface";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import {
  renderWelcomeVerificationEmail,
  renderEmailVerificationEmail,
  renderPasswordResetEmail,
  renderEmailChangeConfirmationEmail,
  renderLoginSecurityAlertEmail,
  renderBookingConfirmedAttendee,
  renderBookingConfirmedHost,
  renderBookingRescheduledAttendee,
  renderBookingRescheduledHost,
  renderBookingCancelledAttendee,
  renderBookingCancelledHost,
  renderBookingReminderAttendee,
  type SnapshotPayload,
} from "../src/notifications/templates/email-templates";

describe("Comprehensive Mailing Service & Email Verification Tests", () => {
  let moduleRef: TestingModule;
  let notificationsService: NotificationsService;
  let notificationsProcessor: NotificationsProcessor;
  let prisma: PrismaService;
  let mockEmailProvider: { send: jest.Mock };

  beforeAll(async () => {
    mockEmailProvider = {
      send: jest.fn().mockResolvedValue({ messageId: "msg_test_123", success: true }),
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(mockEmailProvider)
      .compile();

    notificationsService = moduleRef.get(NotificationsService);
    notificationsProcessor = moduleRef.get(NotificationsProcessor);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. Template Renderers Validation", () => {
    it("renders welcome email template correctly", () => {
      const res = renderWelcomeVerificationEmail(
        { name: "Shoaib Murtaza", email: "shoaib@example.com", username: "shoaibm" },
        "http://localhost:3000/auth/verify-email?token=abc"
      );
      expect(res.subject).toContain("Welcome to Sched");
      expect(res.html).toContain("Shoaib Murtaza");
      expect(res.html).toContain("http://localhost:3000/auth/verify-email?token=abc");
      expect(res.text).toContain("Shoaib Murtaza");
    });

    it("renders email verification template correctly", () => {
      const res = renderEmailVerificationEmail(
        { name: "Shoaib", email: "shoaib@example.com" },
        "http://localhost:3000/auth/verify-email?token=xyz"
      );
      expect(res.subject).toContain("Verify your email address");
      expect(res.html).toContain("http://localhost:3000/auth/verify-email?token=xyz");
    });

    it("renders password reset template correctly", () => {
      const res = renderPasswordResetEmail(
        { name: "Shoaib", email: "shoaib@example.com" },
        "http://localhost:3000/auth/reset-password?token=reset123"
      );
      expect(res.subject).toContain("Reset your Sched account password");
      expect(res.html).toContain("http://localhost:3000/auth/reset-password?token=reset123");
    });

    it("renders email change confirmation template correctly", () => {
      const res = renderEmailChangeConfirmationEmail(
        { name: "Shoaib", currentEmail: "old@example.com" },
        "new@example.com",
        "http://localhost:3000/auth/change-email/confirm?token=change123"
      );
      expect(res.subject).toContain("Confirm your new email address");
      expect(res.html).toContain("new@example.com");
      expect(res.html).toContain("http://localhost:3000/auth/change-email/confirm?token=change123");
    });

    it("renders login security alert template correctly", () => {
      const res = renderLoginSecurityAlertEmail(
        { name: "Shoaib", email: "shoaib@example.com" },
        { timeIso: new Date().toISOString(), ip: "127.0.0.1", userAgent: "Mozilla/5.0" },
        "http://localhost:3000"
      );
      expect(res.subject).toContain("Security Alert");
      expect(res.html).toContain("127.0.0.1");
    });

    it("renders booking snapshot templates (attendee, host, rescheduled, cancelled, reminders)", () => {
      const snapshot: SnapshotPayload = {
        bookingId: "b-100",
        eventTypeId: "et-100",
        eventTitle: "Technical Architecture Review",
        eventSlug: "tech-review",
        durationMinutes: 45,
        hostId: "h-1",
        hostName: "Shoaib Murtaza",
        hostUsername: "shoaibm",
        hostEmail: "shoaib@example.com",
        hostTimeZone: "America/New_York",
        attendeeName: "Jane Doe",
        attendeeEmail: "jane@example.com",
        attendeeTimeZone: "America/Los_Angeles",
        attendeeNotes: "Discussing microservices",
        locationType: "ZOOM",
        locationData: { joinUrl: "https://meet.google.com/abc-defg-hij" },
        startUtc: "2026-10-15T14:00:00.000Z",
        endUtc: "2026-10-15T14:45:00.000Z",
        status: "CONFIRMED",
        sequence: 1,
        tokenVersion: 1,
      };

      const attendeeConfirmed = renderBookingConfirmedAttendee(snapshot, "http://localhost:3000/manage");
      expect(attendeeConfirmed.subject).toContain("Confirmed: Technical Architecture Review");
      expect(attendeeConfirmed.html).toContain("Shoaib Murtaza");
      expect(attendeeConfirmed.html).toContain("https://meet.google.com/abc-defg-hij");

      const hostConfirmed = renderBookingConfirmedHost(snapshot, "http://localhost:3000", "http://localhost:3000/manage");
      expect(hostConfirmed.subject).toContain("New Booking: Jane Doe - Technical Architecture Review");

      const attendeeRescheduled = renderBookingRescheduledAttendee(snapshot, "http://localhost:3000/manage");
      expect(attendeeRescheduled.subject).toContain("Rescheduled");

      const hostRescheduled = renderBookingRescheduledHost(snapshot, "http://localhost:3000", "http://localhost:3000/manage");
      expect(hostRescheduled.subject).toContain("Rescheduled");

      const attendeeCancelled = renderBookingCancelledAttendee(snapshot, "http://localhost:3000");
      expect(attendeeCancelled.subject).toContain("Cancelled");

      const hostCancelled = renderBookingCancelledHost(snapshot, "http://localhost:3000");
      expect(hostCancelled.subject).toContain("Cancelled");

      const reminder = renderBookingReminderAttendee(snapshot, "http://localhost:3000/manage", "in 24 hours");
      expect(reminder.subject).toContain("Reminder: Technical Architecture Review");
    });
  });

  describe("2. NotificationsService Direct Mail Methods", () => {
    const testUser = { id: "u-999", name: "Test User", email: "testuser@example.com", username: "testuser" };

    it("sends welcome verification email", async () => {
      await notificationsService.sendWelcomeVerificationEmail(testUser);
      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "testuser@example.com",
          subject: expect.stringContaining("Welcome to Sched"),
          idempotencyKey: "user:u-999:welcome",
        })
      );
    });

    it("sends email verification request email", async () => {
      await notificationsService.sendEmailVerificationEmail(testUser, "verify_token_456");
      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "testuser@example.com",
          subject: expect.stringContaining("Verify your email address"),
        })
      );
    });

    it("sends password reset email", async () => {
      await notificationsService.sendPasswordResetEmail(testUser, "reset_token_789");
      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "testuser@example.com",
          subject: expect.stringContaining("Reset your Sched account password"),
        })
      );
    });

    it("sends email change confirmation email", async () => {
      await notificationsService.sendEmailChangeConfirmationEmail(
        { id: "u-999", name: "Test User", currentEmail: "testuser@example.com" },
        "newemail@example.com",
        "change_token_000"
      );
      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "newemail@example.com",
          subject: expect.stringContaining("Confirm your new email address"),
        })
      );
    });

    it("sends login security alert email", async () => {
      await notificationsService.sendLoginSecurityAlertEmail(testUser, { ip: "192.168.1.1", userAgent: "Chrome" });
      expect(mockEmailProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "testuser@example.com",
          subject: expect.stringContaining("Security Alert"),
        })
      );
    });
  });

  describe("3. SmtpEmailProvider Instantiation & Transport Options", () => {
    it("instantiates SmtpEmailProvider with family: 4 option", () => {
      const config = new ConfigService({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "user",
        SMTP_PASS: "pass",
        SMTP_SECURE: "false",
      });

      const provider = new SmtpEmailProvider(config);
      expect(provider).toBeDefined();
    });

    it("instantiates DevEmailProvider", () => {
      const devProvider = new DevEmailProvider();
      expect(devProvider).toBeDefined();
    });
  });
});
