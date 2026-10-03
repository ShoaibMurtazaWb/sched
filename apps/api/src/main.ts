import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { json } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { JSON_BODY_LIMIT } from "./shared/constants";
import { HttpErrorFilter } from "./shared/filters/http-error.filter";
import { RequestIdInterceptor } from "./shared/interceptors/request-id.interceptor";
import { StructuredLoggerService } from "./shared/services/structured-logger.service";

async function bootstrap(): Promise<void> {
  const logger = new StructuredLoggerService();
  const app = await NestFactory.create(AppModule, { rawBody: false, logger });
  const expressApp = app.getHttpAdapter().getInstance();
  if (process.env.TRUST_PROXY === "true" || process.env.NODE_ENV === "production") {
    expressApp.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.enableShutdownHooks();

  const rawOrigins = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const allowedOrigins = rawOrigins
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Server-to-server or same-origin requests carry no Origin header -> allow
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.trim().replace(/\/+$/, "");
      const isDevOrTest = process.env.NODE_ENV !== "production";

      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed === "*") return true;
        if (allowed.startsWith("*.")) {
          return normalizedOrigin.endsWith(allowed.slice(1));
        }
        return normalizedOrigin === allowed;
      }) || (isDevOrTest && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin))
        || (normalizedOrigin.endsWith(".vercel.app"));

      if (isAllowed) {
        callback(null, true);
      } else {
        logger.warn(`Origin ${origin} not allowed by CORS`, "CORS");
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  });

  if (process.env.NODE_ENV !== "production") {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Sched API")
        .setDescription("v0.1.0 scheduling API")
        .setVersion("0.1.0")
        .addCookieAuth("sched_session")
        .build(),
    );
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
