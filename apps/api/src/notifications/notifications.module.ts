import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SharedModule } from "../shared/shared.module";
import { EMAIL_PROVIDER } from "./interfaces/email-provider.interface";
import { DevEmailProvider } from "./providers/dev-email.provider";
import { SmtpEmailProvider } from "./providers/smtp-email.provider";
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
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        config: ConfigService,
        devProvider: DevEmailProvider,
        smtpProvider: SmtpEmailProvider
      ) => {
        if (process.env.NODE_ENV === "test") {
          return devProvider;
        }
        const providerType =
          config.get<string>("EMAIL_PROVIDER") ||
          process.env.EMAIL_PROVIDER ||
          (process.env.NODE_ENV === "production" ? "smtp" : "dev");
        return providerType === "smtp" ? smtpProvider : devProvider;
      },
      inject: [ConfigService, DevEmailProvider, SmtpEmailProvider],
    },
  ],
  exports: [
    NotificationsService,
    NotificationsProcessor,
    EMAIL_PROVIDER,
    DevEmailProvider,
  ],
})
export class NotificationsModule {}
