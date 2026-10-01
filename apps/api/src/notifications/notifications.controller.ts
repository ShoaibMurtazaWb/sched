import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { NotificationsProcessor } from "./notifications.processor";
import { EMAIL_PROVIDER, type EmailProvider } from "./interfaces/email-provider.interface";

@ApiTags("notifications")
@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(
    private readonly processor: NotificationsProcessor,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider
  ) {}

  @Post("sweep")
  @HttpCode(200)
  @ApiOperation({ summary: "Process pending notification outbox jobs" })
  async sweep() {
    return this.processor.processPendingJobs(20);
  }

  @Post("test-email")
  @HttpCode(200)
  @ApiOperation({ summary: "Send a test email to verify SMTP / Email Provider settings" })
  async sendTestEmail(@Body("to") to?: string) {
    const targetEmail = to || "shoaibmurtazawb@gmail.com";
    const result = await this.emailProvider.send({
      to: targetEmail,
      subject: "Sched SMTP Live Test Email",
      html: `
        <div style="font-family: sans-serif; padding: 20px; background-color: #f9fafb; color: #111827; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">Sched Test Email</h2>
          <p>This is a live test email sent from your <strong>Sched API</strong> instance to verify that your SMTP mailing service is functioning perfectly!</p>
          <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
      text: `Sched Test Email\n\nThis is a live test email sent from your Sched API instance to verify SMTP configuration.\n\nTimestamp: ${new Date().toISOString()}`,
    });

    return {
      success: true,
      message: `Test email successfully dispatched to ${targetEmail}`,
      details: result,
    };
  }
}
