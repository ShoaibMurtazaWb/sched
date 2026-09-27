import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { IntegrationsController } from "./integrations.controller";
import { CALENDAR_PROVIDER } from "./interfaces/calendar-provider.interface";
import { GoogleCalendarProvider } from "./providers/google-calendar.provider";
import { CalendarSyncProcessor } from "./services/calendar-sync.processor";
import { GoogleCalendarService } from "./services/google-calendar.service";
import { ZoomService } from "./services/zoom.service";

@Module({
  imports: [AuthModule],
  controllers: [IntegrationsController],
  providers: [
    GoogleCalendarProvider,
    {
      provide: CALENDAR_PROVIDER,
      useClass: GoogleCalendarProvider,
    },
    GoogleCalendarService,
    ZoomService,
    CalendarSyncProcessor,
  ],
  exports: [GoogleCalendarService, ZoomService, CalendarSyncProcessor, CALENDAR_PROVIDER],
})
export class IntegrationsModule {}
