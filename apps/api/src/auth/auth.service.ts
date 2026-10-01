import { Injectable } from "@nestjs/common";
import { AuthTokenType } from "@prisma/client";
import type {
  LoginBody,
  RegisterBody,
  RequestPasswordResetBody,
  ResetPasswordBody,
  RequestEmailChangeBody,
  ConfirmEmailChangeBody,
  ConfirmEmailVerificationBody,
} from "@sched/api-contract";
import { BadRequestError, ConflictError, UnauthorizedError } from "../shared/errors/app-error";
import { IdentityService } from "../identity/identity.service";
import { toCurrentUser, type CurrentUserResponse } from "../identity/identity.types";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";
import { AuthTokenService } from "./auth-token.service";
import { AuditService } from "../audit/audit.service";
import { RequestContext } from "../shared/context/request-context";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../shared/prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly identity: IdentityService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: AuthTokenService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  async register(input: RegisterBody): Promise<{ user: CurrentUserResponse; token: string }> {
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.identity.createUser(input, passwordHash);
    const { token } = await this.sessions.create(user.id);

    RequestContext.setUserId(user.id);
    await this.audit.log({
      userId: user.id,
      action: "AUTHENTICATION_REGISTER",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, username: user.username },
    });

    // Generate Verification Token & Send Verification Email
    const verifyToken = await this.tokens.createToken(
      user.id,
      AuthTokenType.EMAIL_VERIFICATION,
      24 * 60 * 60 * 1000 // 24 hours
    );

    if (process.env.NODE_ENV !== "test") {
      await this.notifications.sendEmailVerificationEmail(
        {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        verifyToken
      );
    }

    return { user: toCurrentUser(user), token };
  }

  async login(
    input: LoginBody,
    meta?: { ip?: string; userAgent?: string }
  ): Promise<{ user: CurrentUserResponse; token: string }> {
    const user = await this.identity.findByEmail(input.email);
    if (!user) {
      await this.audit.log({
        action: "AUTHENTICATION_FAILED",
        entityType: "User",
        metadata: { email: input.email, reason: "USER_NOT_FOUND" },
      });
      throw new UnauthorizedError("Invalid email or password");
    }
    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) {
      await this.audit.log({
        userId: user.id,
        action: "AUTHENTICATION_FAILED",
        entityType: "User",
        entityId: user.id,
        metadata: { email: input.email, reason: "INVALID_PASSWORD" },
      });
      throw new UnauthorizedError("Invalid email or password");
    }
    const { token } = await this.sessions.create(user.id);

    RequestContext.setUserId(user.id);
    await this.audit.log({
      userId: user.id,
      action: "AUTHENTICATION_LOGIN",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    });

    // Send Professional Login Security Alert Email
    if (process.env.NODE_ENV !== "test") {
      await this.notifications.sendLoginSecurityAlertEmail(
        {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        {
          timeIso: new Date().toISOString(),
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        }
      );
    }

    return { user: toCurrentUser(user), token };
  }

  async me(userId: string): Promise<CurrentUserResponse> {
    const user = await this.identity.findById(userId);
    if (!user) {
      throw new UnauthorizedError();
    }
    return toCurrentUser(user);
  }

  async logout(sessionId: string): Promise<void> {
    await this.audit.log({
      action: "AUTHENTICATION_LOGOUT",
      entityType: "Session",
      entityId: sessionId,
    });
    return this.sessions.revoke(sessionId);
  }

  async requestEmailVerification(userId: string): Promise<{ message: string }> {
    const user = await this.identity.findById(userId);
    if (!user) {
      throw new UnauthorizedError();
    }

    if (user.emailVerifiedAt) {
      return { message: "Your email address is already verified." };
    }

    const verifyToken = await this.tokens.createToken(
      user.id,
      AuthTokenType.EMAIL_VERIFICATION,
      24 * 60 * 60 * 1000 // 24 hours
    );

    if (process.env.NODE_ENV !== "test") {
      await this.notifications.sendEmailVerificationEmail(
        {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        verifyToken
      );
    }

    return { message: "Verification email sent. Please check your inbox." };
  }

  async confirmEmailVerification(body: ConfirmEmailVerificationBody): Promise<{ message: string }> {
    const { userId } = await this.tokens.verifyAndConsumeToken(
      body.token,
      AuthTokenType.EMAIL_VERIFICATION
    );

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      action: "EMAIL_VERIFIED",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    });

    return { message: "Email address verified successfully!" };
  }

  async requestPasswordReset(body: RequestPasswordResetBody): Promise<{ message: string }> {
    const user = await this.identity.findByEmail(body.email);
    if (user) {
      const resetToken = await this.tokens.createToken(
        user.id,
        AuthTokenType.PASSWORD_RESET,
        60 * 60 * 1000 // 1 hour
      );

      if (process.env.NODE_ENV !== "test") {
        await this.notifications.sendPasswordResetEmail(
          {
            id: user.id,
            name: user.name,
            email: user.email,
          },
          resetToken
        );
      }
    }

    return { message: "If an account exists with this email, a reset link has been sent." };
  }

  async resetPassword(body: ResetPasswordBody): Promise<{ message: string }> {
    const { userId } = await this.tokens.verifyAndConsumeToken(
      body.token,
      AuthTokenType.PASSWORD_RESET
    );

    const newPasswordHash = await this.passwords.hash(body.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Revoke all existing sessions for security
    await this.sessions.revokeAllForUser(userId);

    await this.audit.log({
      userId,
      action: "PASSWORD_RESET",
      entityType: "User",
      entityId: userId,
    });

    return { message: "Password updated successfully. Please log in with your new password." };
  }

  async requestEmailChange(
    userId: string,
    body: RequestEmailChangeBody
  ): Promise<{ message: string }> {
    const user = await this.identity.findById(userId);
    if (!user) {
      throw new UnauthorizedError();
    }

    const ok = await this.passwords.verify(user.passwordHash, body.password);
    if (!ok) {
      throw new UnauthorizedError("Current password is incorrect.");
    }

    const targetEmail = body.newEmail.toLowerCase().trim();
    if (targetEmail === user.email.toLowerCase()) {
      throw new BadRequestError("SAME_EMAIL", "The new email address cannot be the same as your current email.");
    }

    const existingUser = await this.identity.findByEmail(targetEmail);
    if (existingUser) {
      throw new ConflictError("EMAIL_CONFLICT", "An account with this email address already exists.");
    }

    const changeToken = await this.tokens.createToken(
      user.id,
      AuthTokenType.EMAIL_CHANGE,
      2 * 60 * 60 * 1000, // 2 hours
      { newEmail: targetEmail }
    );

    if (process.env.NODE_ENV !== "test") {
      await this.notifications.sendEmailChangeConfirmationEmail(
        {
          id: user.id,
          name: user.name,
          currentEmail: user.email,
        },
        targetEmail,
        changeToken
      );
    }

    return { message: `Verification email sent to ${targetEmail}. Please check your inbox to confirm the change.` };
  }

  async confirmEmailChange(body: ConfirmEmailChangeBody): Promise<{ message: string }> {
    const { userId, payload } = await this.tokens.verifyAndConsumeToken(
      body.token,
      AuthTokenType.EMAIL_CHANGE
    );

    const newEmail = typeof payload?.newEmail === "string" ? payload.newEmail : null;
    if (!newEmail) {
      throw new BadRequestError("INVALID_TOKEN", "Invalid email change payload.");
    }

    const existingUser = await this.identity.findByEmail(newEmail);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictError("EMAIL_CONFLICT", "An account with this email address already exists.");
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: newEmail,
        emailVerifiedAt: new Date(),
      },
    });

    await this.audit.log({
      userId: updatedUser.id,
      action: "EMAIL_CHANGED",
      entityType: "User",
      entityId: updatedUser.id,
      metadata: { newEmail },
    });

    return { message: "Your email address has been updated and verified successfully!" };
  }
}
