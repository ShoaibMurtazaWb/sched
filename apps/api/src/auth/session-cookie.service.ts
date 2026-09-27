import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CookieOptions, Response } from "express";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "../shared/constants";

@Injectable()
export class SessionCookieService {
  constructor(private readonly config: ConfigService) {}

  set(response: Response, token: string): void {
    response.cookie(SESSION_COOKIE_NAME, token, this.options());
  }

  clear(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, this.options());
  }

  private options(): CookieOptions {
    const isProduction = this.config.get("NODE_ENV") === "production";
    const secure = this.config.get<string>("COOKIE_SECURE") === "true" || isProduction;
    const configuredSameSite = this.config.get<string>("COOKIE_SAME_SITE");
    const sameSite = (configuredSameSite as "none" | "lax" | "strict") || (isProduction ? "none" : "lax");
    return {
      httpOnly: true,
      sameSite,
      secure: sameSite === "none" ? true : secure,
      path: "/",
      maxAge: SESSION_TTL_MS,
    };
  }
}
