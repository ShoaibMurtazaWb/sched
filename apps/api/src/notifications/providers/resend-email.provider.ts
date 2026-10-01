import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import type { EmailProvider, EmailSendResult, SendEmailOptions } from "../interfaces/email-provider.interface";

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger("ResendEmailProvider");
  private readonly resend: Resend;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("RESEND_API_KEY") || process.env.RESEND_API_KEY || "re_dummy_key_for_initialization";
    this.fromAddress =
      this.config.get<string>("EMAIL_FROM") ||
      process.env.EMAIL_FROM ||
      "Sched Notifications <no-reply@sched.com>";

    this.resend = new Resend(apiKey);
  }

  async send(options: SendEmailOptions): Promise<EmailSendResult> {
    try {
      const attachments = options.attachments?.map((a) => ({
        filename: a.filename,
        content: typeof a.content === "string" ? Buffer.from(a.content) : a.content,
      }));

      const response = await this.resend.emails.send(
        {
          from: this.fromAddress,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          attachments,
        },
        options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined
      );

      if (response.error) {
        throw new Error(`Resend API error: ${response.error.message}`);
      }

      const messageId = response.data?.id ?? "";
      this.logger.log(`[RESEND EMAIL SENT] MessageId: ${messageId} to ${options.to}`);

      return { messageId, success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[RESEND EMAIL FAILED] Error sending to ${options.to}: ${errMsg}`);
      throw err;
    }
  }
}
