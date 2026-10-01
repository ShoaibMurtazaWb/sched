import { Injectable } from "@nestjs/common";
import {
  type ProfileSettings,
  type NotificationPreferences,
  type SchedulingPreferences,
  type UserSettingsResponse,
  type ChangePassword,
} from "@sched/api-contract";
import { PrismaService } from "../shared/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/password.service";
import { NotFoundError, ConflictError, BadRequestError } from "../shared/errors/app-error";

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwordService: PasswordService,
  ) {}

  async getSettings(userId: string): Promise<UserSettingsResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return {
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        timezone: user.timezone,
        avatarUrl: user.avatarUrl,
        emailVerified: Boolean(user.emailVerifiedAt),
        emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      notificationPreferences: {
        emailReminders: user.emailReminders,
        bookingConfirmations: user.bookingConfirmations,
        marketingEmails: user.marketingEmails,
      },
      schedulingPreferences: {
        defaultMeetingDuration: user.defaultMeetingDuration,
        defaultBufferMinutes: user.defaultBufferMinutes,
        defaultTimezone: user.timezone,
      },
    };
  }

  async updateProfile(userId: string, body: ProfileSettings): Promise<UserSettingsResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (body.username && body.username.toLowerCase() !== user.username.toLowerCase()) {
      const existing = await this.prisma.user.findUnique({
        where: { username: body.username },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictError("USERNAME_CONFLICT", "This username is already taken.", {
          fields: { username: "taken" },
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: body.name,
        username: body.username,
        timezone: body.timezone,
        avatarUrl: body.avatarUrl || null,
      },
    });

    await this.audit.log({
      userId,
      action: "SETTINGS_PROFILE_UPDATED",
      entityType: "User",
      entityId: userId,
      metadata: {
        name: body.name,
        username: body.username,
        timezone: body.timezone,
        avatarUrl: body.avatarUrl,
      },
    });

    return {
      profile: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        username: updated.username,
        timezone: updated.timezone,
        avatarUrl: updated.avatarUrl,
        emailVerified: Boolean(updated.emailVerifiedAt),
        emailVerifiedAt: updated.emailVerifiedAt ? updated.emailVerifiedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
      },
      notificationPreferences: {
        emailReminders: updated.emailReminders,
        bookingConfirmations: updated.bookingConfirmations,
        marketingEmails: updated.marketingEmails,
      },
      schedulingPreferences: {
        defaultMeetingDuration: updated.defaultMeetingDuration,
        defaultBufferMinutes: updated.defaultBufferMinutes,
        defaultTimezone: updated.timezone,
      },
    };
  }

  async updateNotificationPreferences(
    userId: string,
    body: NotificationPreferences,
  ): Promise<UserSettingsResponse> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailReminders: body.emailReminders,
        bookingConfirmations: body.bookingConfirmations,
        marketingEmails: body.marketingEmails,
      },
    });

    await this.audit.log({
      userId,
      action: "SETTINGS_NOTIFICATIONS_UPDATED",
      entityType: "User",
      entityId: userId,
      metadata: body,
    });

    return this.getSettings(updated.id);
  }

  async updateSchedulingPreferences(
    userId: string,
    body: SchedulingPreferences,
  ): Promise<UserSettingsResponse> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        defaultMeetingDuration: body.defaultMeetingDuration,
        defaultBufferMinutes: body.defaultBufferMinutes,
        timezone: body.defaultTimezone,
      },
    });

    await this.audit.log({
      userId,
      action: "SETTINGS_SCHEDULING_UPDATED",
      entityType: "User",
      entityId: userId,
      metadata: body,
    });

    return this.getSettings(updated.id);
  }

  async changePassword(
    userId: string,
    body: ChangePassword,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const isMatch = await this.passwordService.verify(user.passwordHash, body.currentPassword);
    if (!isMatch) {
      throw new BadRequestError("INVALID_CURRENT_PASSWORD", "Your current password is incorrect.", {
        fields: { currentPassword: "Incorrect current password" },
      });
    }

    const newHash = await this.passwordService.hash(body.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.audit.log({
      userId,
      action: "SETTINGS_PASSWORD_CHANGED",
      entityType: "User",
      entityId: userId,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: "Your password has been changed successfully.",
    };
  }
}
