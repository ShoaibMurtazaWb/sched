import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { SESSION_COOKIE_NAME } from "../shared/constants";
import { UnauthorizedError } from "../shared/errors/app-error";
import { SessionService } from "./session.service";

export type AuthenticatedRequest = Request & {
  userId: string;
  sessionId: string;
};

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    let token = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== "string" || token.length === 0) {
      const authHeader = request.headers?.["authorization"] ?? request.headers?.["Authorization"];
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      }
    }
    if (typeof token !== "string" || token.length === 0) {
      throw new UnauthorizedError();
    }
    const session = await this.sessions.authenticate(token);
    request.userId = session.userId;
    request.sessionId = session.sessionId;
    return true;
  }
}
