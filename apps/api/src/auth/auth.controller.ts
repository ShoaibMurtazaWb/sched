import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  loginBodySchema,
  registerBodySchema,
  requestPasswordResetBodySchema,
  resetPasswordBodySchema,
  requestEmailChangeBodySchema,
  confirmEmailChangeBodySchema,
  confirmEmailVerificationBodySchema,
  type LoginBody,
  type RegisterBody,
  type RequestPasswordResetBody,
  type ResetPasswordBody,
  type RequestEmailChangeBody,
  type ConfirmEmailChangeBody,
  type ConfirmEmailVerificationBody,
} from "@sched/api-contract";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { zodPipe } from "../shared/pipes/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { CurrentSessionId, CurrentUserId } from "./current-user.decorator";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionCookieService } from "./session-cookie.service";

@ApiTags("auth")
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookieService,
  ) {}

  @Post("register")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Register and start a session" })
  async register(
    @Body(zodPipe(registerBodySchema)) body: RegisterBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.auth.register(body);
    this.cookies.set(response, token);
    return user;
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Log in and start a session" })
  async login(
    @Body(zodPipe(loginBodySchema)) body: LoginBody,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
    const ip = (typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0]?.trim() : undefined) || req.ip;

    const { user, token } = await this.auth.login(body, { ip, userAgent });
    this.cookies.set(response, token);
    return user;
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Revoke the current session" })
  async logout(
    @CurrentSessionId() sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(sessionId);
    this.cookies.clear(response);
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Current authenticated user" })
  me(@CurrentUserId() userId: string) {
    return this.auth.me(userId);
  }

  @Post("verify-email/request")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Request a new email verification link" })
  requestEmailVerification(@CurrentUserId() userId: string) {
    return this.auth.requestEmailVerification(userId);
  }

  @Post("verify-email/confirm")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Confirm email address verification token" })
  confirmEmailVerification(@Body(zodPipe(confirmEmailVerificationBodySchema)) body: ConfirmEmailVerificationBody) {
    return this.auth.confirmEmailVerification(body);
  }

  @Post("forgot-password")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Request password reset email link" })
  requestPasswordReset(@Body(zodPipe(requestPasswordResetBodySchema)) body: RequestPasswordResetBody) {
    return this.auth.requestPasswordReset(body);
  }

  @Post("reset-password")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Reset account password with token" })
  resetPassword(@Body(zodPipe(resetPasswordBodySchema)) body: ResetPasswordBody) {
    return this.auth.resetPassword(body);
  }

  @Post("email-change/request")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Request secure email change confirmation" })
  requestEmailChange(
    @CurrentUserId() userId: string,
    @Body(zodPipe(requestEmailChangeBodySchema)) body: RequestEmailChangeBody
  ) {
    return this.auth.requestEmailChange(userId, body);
  }

  @Post("email-change/confirm")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Confirm new email address with token" })
  confirmEmailChange(@Body(zodPipe(confirmEmailChangeBodySchema)) body: ConfirmEmailChangeBody) {
    return this.auth.confirmEmailChange(body);
  }
}
