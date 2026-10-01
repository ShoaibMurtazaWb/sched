import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { google } from "googleapis";
import type { EmailProvider, EmailSendResult, SendEmailOptions } from "../interfaces/email-provider.interface";

@Injectable()
export class GmailEmailProvider implements EmailProvider {
  private readonly logger = new Logger("GmailEmailProvider");
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    // Dedicated Sched sender account credentials (isolated from host Google Calendar credentials)
    this.clientId =
      this.config.get<string>("GMAIL_CLIENT_ID") ||
      process.env.GMAIL_CLIENT_ID ||
      this.config.get<string>("GOOGLE_CLIENT_ID") ||
      process.env.GOOGLE_CLIENT_ID ||
      "";

    this.clientSecret =
      this.config.get<string>("GMAIL_CLIENT_SECRET") ||
      process.env.GMAIL_CLIENT_SECRET ||
      this.config.get<string>("GOOGLE_CLIENT_SECRET") ||
      process.env.GOOGLE_CLIENT_SECRET ||
      "";

    this.refreshToken =
      this.config.get<string>("GMAIL_REFRESH_TOKEN") || process.env.GMAIL_REFRESH_TOKEN || "";

    this.fromAddress =
      this.config.get<string>("EMAIL_FROM") ||
      process.env.EMAIL_FROM ||
      "Sched <shoaibmurtazawb@gmail.com>";
  }

  private createOAuth2Client() {
    const oauth2Client = new google.auth.OAuth2(this.clientId, this.clientSecret);
    if (this.refreshToken) {
      oauth2Client.setCredentials({ refresh_token: this.refreshToken });
    }
    return oauth2Client;
  }

  /**
   * Encodes a complete MIME raw message string to base64url format for Gmail API users.messages.send
   */
  private buildMimeMessage(options: SendEmailOptions): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const hasAttachments = options.attachments && options.attachments.length > 0;

    let mime = "";
    mime += `From: ${this.fromAddress}\r\n`;
    mime += `To: ${options.to}\r\n`;
    mime += `Subject: =?UTF-8?B?${Buffer.from(options.subject, "utf-8").toString("base64")}?=\r\n`;
    mime += `MIME-Version: 1.0\r\n`;

    if (options.idempotencyKey) {
      mime += `X-Idempotency-Key: ${options.idempotencyKey}\r\n`;
    }

    if (hasAttachments) {
      mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
      mime += `--${boundary}\r\n`;
      mime += `Content-Type: multipart/alternative; boundary="${boundary}_alt"\r\n\r\n`;

      if (options.text) {
        mime += `--${boundary}_alt\r\n`;
        mime += `Content-Type: text/plain; charset=UTF-8\r\n`;
        mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
        mime += `${Buffer.from(options.text, "utf-8").toString("base64")}\r\n\r\n`;
      }

      mime += `--${boundary}_alt\r\n`;
      mime += `Content-Type: text/html; charset=UTF-8\r\n`;
      mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
      mime += `${Buffer.from(options.html, "utf-8").toString("base64")}\r\n\r\n`;
      mime += `--${boundary}_alt--\r\n\r\n`;

      for (const attachment of options.attachments!) {
        const contentBuffer =
          typeof attachment.content === "string"
            ? Buffer.from(attachment.content, "utf-8")
            : attachment.content;

        const contentType = attachment.contentType || "application/octet-stream";

        mime += `--${boundary}\r\n`;
        mime += `Content-Type: ${contentType}; name="${attachment.filename}"\r\n`;
        mime += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
        mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
        mime += `${contentBuffer.toString("base64")}\r\n\r\n`;
      }

      mime += `--${boundary}--\r\n`;
    } else {
      mime += `Content-Type: multipart/alternative; boundary="${boundary}_alt"\r\n\r\n`;

      if (options.text) {
        mime += `--${boundary}_alt\r\n`;
        mime += `Content-Type: text/plain; charset=UTF-8\r\n`;
        mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
        mime += `${Buffer.from(options.text, "utf-8").toString("base64")}\r\n\r\n`;
      }

      mime += `--${boundary}_alt\r\n`;
      mime += `Content-Type: text/html; charset=UTF-8\r\n`;
      mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
      mime += `${Buffer.from(options.html, "utf-8").toString("base64")}\r\n\r\n`;
      mime += `--${boundary}_alt--\r\n`;
    }

    return Buffer.from(mime)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  async send(options: SendEmailOptions): Promise<EmailSendResult> {
    try {
      if (!this.refreshToken) {
        throw new Error(
          "GMAIL_REFRESH_TOKEN is missing in environment configuration. Unable to send email via Gmail API."
        );
      }

      const auth = this.createOAuth2Client();
      const gmail = google.gmail({ version: "v1", auth });
      const raw = this.buildMimeMessage(options);

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });

      const messageId = response.data.id ?? "";
      this.logger.log(`[GMAIL API EMAIL SENT] MessageId: ${messageId} to ${options.to}`);

      return { messageId, success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[GMAIL API EMAIL FAILED] Error sending to ${options.to}: ${errMsg}`);
      throw err;
    }
  }
}
