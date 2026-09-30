import { Test } from "@nestjs/testing";
import { INestApplication, CanActivate } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { HttpErrorFilter } from "../src/shared/filters/http-error.filter";
import { RequestIdInterceptor } from "../src/shared/interceptors/request-id.interceptor";
import { PrismaService } from "../src/shared/prisma/prisma.service";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://sched:sched@localhost:5432/sched";
}

if (!process.env.CALENDAR_ENCRYPTION_KEY) {
  process.env.CALENDAR_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

if (typeof jest !== "undefined") {
  jest.setTimeout(30000);
}

import { APP_GUARD } from "@nestjs/core";

class AllowAllThrottlerGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(APP_GUARD)
    .useClass(AllowAllThrottlerGuard)
    .overrideGuard(ThrottlerGuard)
    .useClass(AllowAllThrottlerGuard)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());
  await app.init();
  return app;
}

export async function resetDatabase(app?: INestApplication): Promise<void> {
  if (!app) return;
  const prisma = app.get(PrismaService);
  const userFilter = {
    schedule: {
      user: {
        email: {
          contains: "example.com",
          mode: "insensitive" as const,
        },
      },
    },
  };

  const bookingFilter = {
    OR: [
      { host: { email: { contains: "example.com", mode: "insensitive" as const } } },
      { attendeeEmail: { contains: "example.com", mode: "insensitive" as const } },
      { eventType: { user: { email: { contains: "example.com", mode: "insensitive" as const } } } },
    ],
  };

  const safeDelete = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      // Ignore cleanup constraint errors between specs
    }
  };

  await safeDelete(() =>
    prisma.auditLog.deleteMany({
      where: {
        user: {
          email: { contains: "example.com", mode: "insensitive" as const },
        },
      },
    })
  );
  await safeDelete(() =>
    prisma.calendarSyncJob.deleteMany({
      where: {
        OR: [
          { booking: bookingFilter },
          { integration: { user: { email: { contains: "example.com", mode: "insensitive" as const } } } },
        ],
      },
    })
  );
  await safeDelete(() =>
    prisma.externalCalendarEvent.deleteMany({
      where: {
        OR: [
          { booking: bookingFilter },
          { integration: { user: { email: { contains: "example.com", mode: "insensitive" as const } } } },
        ],
      },
    })
  );
  await safeDelete(() =>
    prisma.notificationJob.deleteMany({
      where: {
        OR: [
          { recipientEmail: { contains: "example.com", mode: "insensitive" as const } },
          { booking: bookingFilter },
        ],
      },
    })
  );
  await safeDelete(() =>
    prisma.bookingRescheduleHistory.deleteMany({
      where: { booking: bookingFilter },
    })
  );
  await safeDelete(() => prisma.booking.deleteMany({ where: bookingFilter }));
  await safeDelete(() =>
    prisma.zoomIntegration.deleteMany({
      where: {
        user: { email: { contains: "example.com", mode: "insensitive" as const } },
      },
    })
  );
  await safeDelete(() =>
    prisma.calendarIntegration.deleteMany({
      where: {
        user: { email: { contains: "example.com", mode: "insensitive" as const } },
      },
    })
  );
  await safeDelete(() => prisma.scheduleOverride.deleteMany({ where: userFilter }));
  await safeDelete(() => prisma.scheduleDay.deleteMany({ where: userFilter }));
  await safeDelete(() =>
    prisma.schedule.deleteMany({
      where: {
        user: { email: { contains: "example.com", mode: "insensitive" as const } },
      },
    })
  );
  await safeDelete(() =>
    prisma.eventType.deleteMany({
      where: {
        user: { email: { contains: "example.com", mode: "insensitive" as const } },
      },
    })
  );
  await safeDelete(() =>
    prisma.session.deleteMany({
      where: {
        user: { email: { contains: "example.com", mode: "insensitive" as const } },
      },
    })
  );
  await safeDelete(() =>
    prisma.user.deleteMany({
      where: { email: { contains: "example.com", mode: "insensitive" as const } },
    })
  );
}


export function uniqueLabel(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
