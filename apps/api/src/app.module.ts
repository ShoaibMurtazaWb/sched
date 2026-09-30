import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { validateEnv } from "./config/env.schema";
import { EventTypesModule } from "./event-types/event-types.module";
import { IdentityModule } from "./identity/identity.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { SchedulesModule } from "./schedules/schedules.module";
import { SettingsModule } from "./settings/settings.module";
import { SharedModule } from "./shared/shared.module";
import { RequestContextMiddleware } from "./shared/middleware/request-context.middleware";
import { AppController } from "./app.controller";

const isTestEnv = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: "default", ttl: 60000, limit: isTestEnv ? 100000 : 120 },
        { name: "public", ttl: 60000, limit: isTestEnv ? 100000 : 100 },
        { name: "auth", ttl: 60000, limit: isTestEnv ? 100000 : 30 },
      ],
    }),
    SharedModule,
    AuditModule,
    IdentityModule,
    AuthModule,
    SchedulesModule,
    IntegrationsModule,
    NotificationsModule,
    BookingsModule,
    EventTypesModule,
    AnalyticsModule,
    SettingsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}



