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

class AllowAllThrottlerGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
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

export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const userFilter = {
    schedule: {
      user: {
        email: {
          contains: "example.com",
        },
      },
    },
  };

  const bookingFilter = {
    OR: [
      { host: { email: { contains: "example.com" } } },
      { attendeeEmail: { contains: "example.com" } },
      { eventType: { user: { email: { contains: "example.com" } } } },
    ],
  };

  await prisma.auditLog.deleteMany({
    where: {
      user: {
        email: {
          contains: "example.com",
        },
      },
    },
  });
  await prisma.calendarSyncJob.deleteMany({
    where: {
      OR: [
        { booking: bookingFilter },
        { integration: { user: { email: { contains: "example.com" } } } },
      ],
    },
  });
  await prisma.externalCalendarEvent.deleteMany({
    where: {
      OR: [
        { booking: bookingFilter },
        { integration: { user: { email: { contains: "example.com" } } } },
      ],
    },
  });
  await prisma.notificationJob.deleteMany({
    where: {
      OR: [
        { recipientEmail: { contains: "example.com" } },
        { booking: bookingFilter },
      ],
    },
  });
  await prisma.bookingRescheduleHistory.deleteMany({
    where: {
      booking: bookingFilter,
    },
  });
  await prisma.booking.deleteMany({
    where: bookingFilter,
  });
  await prisma.zoomIntegration.deleteMany({
    where: {
      user: {
        email: {
          contains: "example.com",
        },
      },
    },
  });
  await prisma.calendarIntegration.deleteMany({
    where: {
      user: {
        email: {
          contains: "example.com",
        },
      },
    },
  });
  await prisma.scheduleOverride.deleteMany({
    where: userFilter,
  });
  await prisma.scheduleDay.deleteMany({
    where: userFilter,
  });
  await prisma.schedule.deleteMany({
    where: {
      user: {
        email: {
          contains: "example.com",
        },
      },
    },
  });
  await prisma.eventType.deleteMany({
    where: {
      user: {
        email: {
          contains: "example.com",
        },
      },
    },
  });
  await prisma.session.deleteMany({
    where: {
      user: {
        email: {
          contains: "example.com",
        },
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        contains: "example.com",
      },
    },
  });
}


export function uniqueLabel(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
