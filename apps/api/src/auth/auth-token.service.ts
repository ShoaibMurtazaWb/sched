import { Injectable } from "@nestjs/common";
import { AuthTokenType, type Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { BadRequestError } from "../shared/errors/app-error";
import { PrismaService } from "../shared/prisma/prisma.service";

@Injectable()
export class AuthTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  async createToken(
    userId: string,
    type: AuthTokenType,
    expiresInMs: number,
    payload?: Record<string, unknown>
  ): Promise<string> {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInMs);

    // Clear previous tokens of the same type for this user
    await this.prisma.authToken.deleteMany({
      where: { userId, type },
    });

    await this.prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash,
        expiresAt,
        payload: payload ? (payload as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    return rawToken;
  }

  async verifyAndConsumeToken(
    rawToken: string,
    type: AuthTokenType
  ): Promise<{ userId: string; payload?: Record<string, unknown> | null }> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.type !== type) {
      throw new BadRequestError("INVALID_TOKEN", "This link is invalid or has already been used.");
    }

    if (record.expiresAt < new Date()) {
      await this.prisma.authToken.delete({ where: { id: record.id } }).catch(() => {});
      throw new BadRequestError("TOKEN_EXPIRED", "This link has expired. Please request a new one.");
    }

    await this.prisma.authToken.delete({ where: { id: record.id } });

    return {
      userId: record.userId,
      payload: record.payload as Record<string, unknown> | null,
    };
  }
}
