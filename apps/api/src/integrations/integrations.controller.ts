import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  CalendarIntegrationResponse,
  CalendarListResponse,
  UpdateCalendarPreferencesBody,
  ZoomIntegrationResponse,
} from "@sched/api-contract";
import {
  googleCallbackQuerySchema,
  googleConnectQuerySchema,
  updateCalendarPreferencesSchema,
  zoomCallbackQuerySchema,
  zoomConnectQuerySchema,
  type GoogleCallbackQuery,
  type GoogleConnectQuery,
  type ZoomCallbackQuery,
  type ZoomConnectQuery,
} from "@sched/api-contract";
import type { Request, Response } from "express";
import { CurrentSessionId, CurrentUserId } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { zodPipe } from "../shared/pipes/zod-validation.pipe";
import { GoogleCalendarService } from "./services/google-calendar.service";
import { ZoomService } from "./services/zoom.service";

@ApiTags("integrations")
@Controller("api/v1/integrations")
export class IntegrationsController {
  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly zoomService: ZoomService
  ) {}

  @Get("google/connect")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Initiate Google Calendar OAuth 2.0 authorization with PKCE" })
  async connectGoogle(
    @CurrentUserId() userId: string,
    @CurrentSessionId() sessionId: string,
    @Res() res: Response,
    @Query(zodPipe(googleConnectQuerySchema)) _query: GoogleConnectQuery
  ) {
    const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

    try {
      const { url, codeVerifier } = await this.googleCalendarService.getConnectUrl(
        userId,
        sessionId
      );

      // Store PKCE code_verifier in a temporary secure cookie
      res.cookie("sched_pkce_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000, // 10 minutes
      });

      return res.redirect(url);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? encodeURIComponent(err.message) : "Failed+to+initiate+Google+OAuth";
      return res.redirect(`${webOrigin}/dashboard/integrations?error=${errorMsg}`);
    }
  }

  @Get("google/callback")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Complete Google Calendar OAuth 2.0 exchange" })
  async callbackGoogle(
    @CurrentUserId() userId: string,
    @CurrentSessionId() sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query(zodPipe(googleCallbackQuerySchema)) query: GoogleCallbackQuery
  ) {
    const cookies = (req.cookies || {}) as Record<string, string>;
    const codeVerifier =
      cookies["sched_pkce_verifier"] || (req.query["code_verifier"] as string) || "";

    const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

    try {
      await this.googleCalendarService.handleCallback(
        userId,
        sessionId,
        query.code,
        query.state,
        codeVerifier
      );

      res.clearCookie("sched_pkce_verifier", { path: "/" });
      return res.redirect(`${webOrigin}/dashboard/integrations?connected=google`);
    } catch (err: unknown) {
      res.clearCookie("sched_pkce_verifier", { path: "/" });
      const errorMsg =
        err instanceof Error ? encodeURIComponent(err.message) : "Authentication+failed";
      return res.redirect(`${webOrigin}/dashboard/integrations?error=${errorMsg}`);
    }
  }

  @Get("google")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Get Google Calendar integration status and preferences" })
  async getIntegration(@CurrentUserId() userId: string): Promise<CalendarIntegrationResponse | null> {
    return this.googleCalendarService.getIntegration(userId);
  }

  @Get("google/calendars")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "List host's Google Calendars" })
  async listCalendars(@CurrentUserId() userId: string): Promise<CalendarListResponse> {
    return this.googleCalendarService.listHostCalendars(userId);
  }

  @Patch("google/calendars")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Update write destination and conflict calendars" })
  async updatePreferences(
    @CurrentUserId() userId: string,
    @Body(zodPipe(updateCalendarPreferencesSchema)) body: UpdateCalendarPreferencesBody
  ): Promise<CalendarIntegrationResponse> {
    return this.googleCalendarService.updateCalendarPreferences(userId, body);
  }

  @Post("google/disconnect")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Disconnect Google Calendar and erase stored credentials" })
  async disconnect(@CurrentUserId() userId: string): Promise<CalendarIntegrationResponse> {
    return this.googleCalendarService.disconnect(userId);
  }

  // ==========================================
  // Zoom OAuth & Integration Endpoints
  // ==========================================

  @Get("zoom/connect")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Initiate Zoom OAuth 2.0 authorization" })
  async connectZoom(
    @CurrentUserId() userId: string,
    @CurrentSessionId() sessionId: string,
    @Res() res: Response,
    @Query(zodPipe(zoomConnectQuerySchema)) _query: ZoomConnectQuery
  ) {
    const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

    try {
      const { url } = this.zoomService.getConnectUrl(userId, sessionId);
      return res.redirect(url);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? encodeURIComponent(err.message) : "Failed+to+initiate+Zoom+OAuth";
      return res.redirect(`${webOrigin}/dashboard/integrations?error=${errorMsg}`);
    }
  }

  @Get("zoom/callback")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Complete Zoom OAuth 2.0 exchange" })
  async callbackZoom(
    @CurrentUserId() userId: string,
    @CurrentSessionId() sessionId: string,
    @Res() res: Response,
    @Query(zodPipe(zoomCallbackQuerySchema)) query: ZoomCallbackQuery
  ) {
    const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

    try {
      await this.zoomService.handleCallback(
        userId,
        sessionId,
        query.code,
        query.state
      );

      return res.redirect(`${webOrigin}/dashboard/integrations?connected=zoom`);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? encodeURIComponent(err.message) : "Authentication+failed";
      return res.redirect(`${webOrigin}/dashboard/integrations?error=${errorMsg}`);
    }
  }

  @Get("zoom")
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Get Zoom integration status" })
  async getZoomIntegration(@CurrentUserId() userId: string): Promise<ZoomIntegrationResponse | null> {
    return this.zoomService.getIntegration(userId);
  }

  @Post("zoom/disconnect")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Disconnect Zoom account" })
  async disconnectZoom(@CurrentUserId() userId: string): Promise<ZoomIntegrationResponse> {
    return this.zoomService.disconnect(userId);
  }
}



