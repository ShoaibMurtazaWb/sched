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
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    // The Next.js proxy calls the API server-to-server (no Origin header) → always allowed.
    // Browser requests from the Vercel frontend go through the Next.js rewrite, so they
    // arrive at the API without a cross-origin Origin header.
    // We still allow the configured WEB_ORIGIN explicitly for:
    //   - Local development (direct browser → API calls)
    //   - Any future server-sent-events or WebSocket connections
    //   - Vercel preview deployments (*.vercel.app)
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        // No origin = server-to-server (Next.js proxy) or same-origin → allow
        return callback(null, true);
      }
      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed === "*") return true;
        if (allowed.startsWith("*.")) {
          return origin.endsWith(allowed.slice(1));
        }
        // Accept any *.vercel.app origin (Vercel preview deployments)
        if (origin.endsWith(".vercel.app")) {
          return true;
        }
        return origin === allowed;
      });
      if (isAllowed) {
        callback(null, true);
      } else {
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
