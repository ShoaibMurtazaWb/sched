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
    const isTest = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;
    const secure = isTest ? false : (this.config.get<string>("COOKIE_SECURE") === "true" || isProduction);
    // SameSite=Lax is safe: browser API requests are same-origin via the Next.js proxy.
    // SameSite=None is NOT required since we no longer call code.run directly from the browser.
    const sameSite: "lax" | "strict" = "lax";
    return {
      httpOnly: true,
      sameSite,
      secure,
      path: "/",
      maxAge: SESSION_TTL_MS,
    };
  }
}
