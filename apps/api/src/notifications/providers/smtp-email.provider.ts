import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { EmailProvider, EmailSendResult, SendEmailOptions } from "../interfaces/email-provider.interface";

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger("SmtpEmailProvider");
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST", "localhost");
    const port = Number(this.config.get<string>("SMTP_PORT", "1025"));
    const user = this.config.get<string>("SMTP_USER", "");
    const pass = this.config.get<string>("SMTP_PASS", "");
    const secure = this.config.get<string>("SMTP_SECURE", "false") === "true";

    this.fromAddress = this.config.get<string>("EMAIL_FROM", "Sched Notifications <no-reply@sched.com>");

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      family: 4, // Force IPv4 to prevent ENETUNREACH on IPv6-unreachable networks/hosts
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    } as SMTPTransport.Options);
  }

  async send(options: SendEmailOptions): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        headers: options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : undefined,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      this.logger.log(`[SMTP EMAIL SENT] MessageId: ${info.messageId} to ${options.to}`);
      return { messageId: info.messageId, success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SMTP EMAIL FAILED] Error sending to ${options.to}: ${errMsg}`);
      throw err;
    }
  }
}
