import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SharedModule } from "../shared/shared.module";
import { EMAIL_PROVIDER } from "./interfaces/email-provider.interface";
import { DevEmailProvider } from "./providers/dev-email.provider";
import { SmtpEmailProvider } from "./providers/smtp-email.provider";
import { ResendEmailProvider } from "./providers/resend-email.provider";
import { NotificationsController } from "./notifications.controller";
import { NotificationsProcessor } from "./notifications.processor";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [SharedModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    DevEmailProvider,
    SmtpEmailProvider,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        config: ConfigService,
        devProvider: DevEmailProvider,
        smtpProvider: SmtpEmailProvider,
        resendProvider: ResendEmailProvider
      ) => {
        if (process.env.NODE_ENV === "test") {
          return devProvider;
        }
        const providerType = (
          config.get<string>("EMAIL_PROVIDER") ||
          process.env.EMAIL_PROVIDER ||
          (process.env.NODE_ENV === "production" ? "smtp" : "dev")
        ).toLowerCase();

        if (providerType === "resend") {
          return resendProvider;
        }
        if (providerType === "smtp") {
          return smtpProvider;
        }
        return devProvider;
      },
      inject: [ConfigService, DevEmailProvider, SmtpEmailProvider, ResendEmailProvider],
    },
  ],
  exports: [
    NotificationsService,
    NotificationsProcessor,
    EMAIL_PROVIDER,
    DevEmailProvider,
    SmtpEmailProvider,
    ResendEmailProvider,
  ],
})
export class NotificationsModule {}
