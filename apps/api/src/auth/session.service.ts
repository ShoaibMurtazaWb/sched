import { Injectable } from "@nestjs/common";
import type { Session, User } from "@prisma/client";
import { SESSION_TTL_MS } from "../shared/constants";
import { UnauthorizedError } from "../shared/errors/app-error";
import { PrismaService } from "../shared/prisma/prisma.service";
import { generateSessionToken, hashSessionToken } from "./session-token";

export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  user: User;
};

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string): Promise<{ token: string; session: Session }> {
    const token = generateSessionToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return { token, session };
  }

  async authenticate(token: string): Promise<AuthenticatedSession> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Invalid or expired session");
    }
    return { sessionId: session.id, userId: session.userId, user: session.user };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
