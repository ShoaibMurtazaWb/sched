import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ZoomIntegrationStatus } from "@prisma/client";
import type { ZoomIntegrationResponse } from "@sched/api-contract";
import * as crypto from "crypto";
import { BadRequestError, NotFoundError } from "../../shared/errors/app-error";
import { PrismaService } from "../../shared/prisma/prisma.service";
import { CryptoVaultService } from "../../shared/services/crypto-vault.service";

export interface ZoomOAuthStatePayload {
  userId: string;
  sessionId: string;
  nonce: string;
  expiresAt: number;
}

export interface DynamicZoomMeeting {
  meetingId: string;
  joinUrl: string;
  startUrl: string;
  password?: string;
}

@Injectable()
export class ZoomService {
  private readonly logger = new Logger("ZoomService");
  private readonly stateSecret: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly usedNonces = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cryptoVault: CryptoVaultService,
  ) {
    this.stateSecret =
      this.config.get<string>("SESSION_SECRET") ||
      this.config.get<string>("CALENDAR_ENCRYPTION_KEY") ||
      "zoom-state-secret-default";
    this.clientId =
      this.config.get<string>("ZOOM_CLIENT_ID") || process.env.ZOOM_CLIENT_ID || "";
    this.clientSecret =
      this.config.get<string>("ZOOM_CLIENT_SECRET") || process.env.ZOOM_CLIENT_SECRET || "";
    this.redirectUri =
      this.config.get<string>("ZOOM_REDIRECT_URI") ||
      process.env.ZOOM_REDIRECT_URI ||
      "http://localhost:3001/api/v1/integrations/zoom/callback";
  }

  /**
   * Generates a signed, session-bound OAuth state token (10 min TTL).
   */
  generateOAuthState(userId: string, sessionId: string): string {
    const nonce = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    const payload: ZoomOAuthStatePayload = { userId, sessionId, nonce, expiresAt };
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadStr, "utf-8").toString("base64url");

    const hmac = crypto
      .createHmac("sha256", this.stateSecret)
      .update(payloadB64)
      .digest("base64url");
    return `${payloadB64}.${hmac}`;
  }

  /**
   * Verifies and consumes a signed OAuth state token.
   */
  verifyOAuthState(state: string, expectedUserId: string): ZoomOAuthStatePayload {
    const parts = state.split(".");
    if (parts.length !== 2) {
      throw new BadRequestError("INVALID_OAUTH_STATE", "Malformed Zoom OAuth state parameter.");
    }

    const [payloadB64, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", this.stateSecret)
      .update(payloadB64!)
      .digest("base64url");

    if (
      signature!.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(signature!), Buffer.from(expectedSig))
    ) {
      throw new BadRequestError("INVALID_OAUTH_STATE", "Invalid Zoom OAuth state signature.");
    }

    let payload: ZoomOAuthStatePayload;
    try {
      const decoded = Buffer.from(payloadB64!, "base64url").toString("utf-8");
      payload = JSON.parse(decoded) as ZoomOAuthStatePayload;
    } catch {
      throw new BadRequestError("INVALID_OAUTH_STATE", "Failed to parse Zoom OAuth state payload.");
    }

    if (Date.now() > payload.expiresAt) {
      throw new BadRequestError("EXPIRED_OAUTH_STATE", "Zoom OAuth session has expired. Please try connecting again.");
    }

    if (payload.userId !== expectedUserId) {
      throw new BadRequestError("OAUTH_USER_MISMATCH", "OAuth state does not match authenticated user.");
    }

    if (this.usedNonces.has(payload.nonce)) {
      throw new BadRequestError("REPLAYED_OAUTH_STATE", "Zoom OAuth state token has already been used.");
    }
    this.usedNonces.add(payload.nonce);

    return payload;
  }

  /**
   * Build the Zoom OAuth authorization URL.
   */
  getConnectUrl(userId: string, sessionId: string): { url: string } {
    if (!this.clientId) {
      throw new BadRequestError("ZOOM_CONFIG_MISSING", "Zoom Client ID is not configured in server environment.");
    }

    const state = this.generateOAuthState(userId, sessionId);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
    });

    const url = `https://zoom.us/oauth/authorize?${params.toString()}`;
    return { url };
  }

  /**
   * Complete the Zoom OAuth 2.0 exchange and save encrypted credentials.
   */
  async handleCallback(
    userId: string,
    _sessionId: string,
    code: string,
    state: string
  ): Promise<ZoomIntegrationResponse> {
    this.verifyOAuthState(state, userId);

    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestError("ZOOM_CONFIG_MISSING", "Zoom OAuth credentials are not configured.");
    }

    // Exchange authorization code with Zoom
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri,
    });

    const tokenRes = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      this.logger.error(`Zoom OAuth token exchange failed: ${tokenRes.status} ${errorText}`);
      throw new BadRequestError("ZOOM_AUTH_FAILED", "Failed to authenticate with Zoom. Please try again.");
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };

    // Fetch user profile from Zoom API
    const userRes = await fetch("https://api.zoom.us/v2/users/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userRes.ok) {
      const errorText = await userRes.text();
      this.logger.error(`Zoom user info fetch failed: ${userRes.status} ${errorText}`);
      throw new BadRequestError("ZOOM_USER_FETCH_FAILED", "Could not retrieve your Zoom user profile.");
    }

    const userData = (await userRes.json()) as {
      id: string;
      email: string;
      first_name?: string;
      last_name?: string;
    };

    const encryptedAccessToken = this.cryptoVault.encrypt(tokenData.access_token);
    const encryptedRefreshToken = this.cryptoVault.encrypt(tokenData.refresh_token);
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    const record = await this.prisma.zoomIntegration.upsert({
      where: { userId },
      create: {
        userId,
        status: ZoomIntegrationStatus.CONNECTED,
        accountEmail: userData.email,
        zoomUserId: userData.id,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        scope: tokenData.scope || "",
      },
      update: {
        status: ZoomIntegrationStatus.CONNECTED,
        accountEmail: userData.email,
        zoomUserId: userData.id,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        scope: tokenData.scope || "",
      },
    });

    this.logger.log(`Zoom connected successfully for user ${userId} (${userData.email})`);

    return {
      id: record.id,
      status: record.status as ZoomIntegrationResponse["status"],
      accountEmail: record.accountEmail,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Get host's current Zoom integration status.
   */
  async getIntegration(userId: string): Promise<ZoomIntegrationResponse | null> {
    const record = await this.prisma.zoomIntegration.findUnique({
      where: { userId },
    });

    if (!record || record.status === ZoomIntegrationStatus.DISCONNECTED) {
      return null;
    }

    return {
      id: record.id,
      status: record.status as ZoomIntegrationResponse["status"],
      accountEmail: record.accountEmail,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Disconnect host's Zoom account.
   */
  async disconnect(userId: string): Promise<ZoomIntegrationResponse> {
    const existing = await this.prisma.zoomIntegration.findUnique({
      where: { userId },
    });

    if (!existing) {
      throw new NotFoundError("Zoom integration not found.");
    }

    const updated = await this.prisma.zoomIntegration.update({
      where: { userId },
      data: {
        status: ZoomIntegrationStatus.DISCONNECTED,
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
      },
    });

    this.logger.log(`Zoom disconnected for user ${userId}`);

    return {
      id: updated.id,
      status: updated.status as ZoomIntegrationResponse["status"],
      accountEmail: updated.accountEmail,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Internal helper: retrieves or refreshes valid Zoom Access Token for user.
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const integration = await this.prisma.zoomIntegration.findUnique({
      where: { userId },
    });

    if (
      !integration ||
      integration.status !== ZoomIntegrationStatus.CONNECTED ||
      !integration.encryptedAccessToken ||
      !integration.encryptedRefreshToken
    ) {
      throw new BadRequestError("ZOOM_NOT_CONNECTED", "Host has not connected a valid Zoom account.");
    }

    const now = new Date();
    const expiryBufferMs = 3 * 60 * 1000; // 3 minutes buffer

    // Check if token is still valid
    if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() - now.getTime() > expiryBufferMs) {
      return this.cryptoVault.decrypt(integration.encryptedAccessToken);
    }

    // Refresh token
    this.logger.log(`Refreshing Zoom OAuth access token for user ${userId}...`);
    const refreshToken = this.cryptoVault.decrypt(integration.encryptedRefreshToken);
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    const refreshBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const refreshRes = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: refreshBody.toString(),
    });

    if (!refreshRes.ok) {
      const errorText = await refreshRes.text();
      this.logger.error(`Zoom token refresh failed (${refreshRes.status}): ${errorText}`);

      await this.prisma.zoomIntegration.update({
        where: { userId },
        data: { status: ZoomIntegrationStatus.REVOKED },
      });

      throw new BadRequestError("ZOOM_AUTH_REVOKED", "Zoom authorization expired or was revoked. Please reconnect.");
    }

    const refreshData = (await refreshRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const newEncryptedAccess = this.cryptoVault.encrypt(refreshData.access_token);
    const newEncryptedRefresh = this.cryptoVault.encrypt(refreshData.refresh_token);
    const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);

    await this.prisma.zoomIntegration.update({
      where: { userId },
      data: {
        encryptedAccessToken: newEncryptedAccess,
        encryptedRefreshToken: newEncryptedRefresh,
        tokenExpiresAt: newExpiresAt,
        status: ZoomIntegrationStatus.CONNECTED,
      },
    });

    return refreshData.access_token;
  }

  /**
   * Dynamically creates a unique Zoom meeting room for a booking.
   */
  async createMeeting(
    userId: string,
    params: {
      topic: string;
      startTime: Date;
      durationMinutes: number;
      timezone: string;
    }
  ): Promise<DynamicZoomMeeting> {
    const accessToken = await this.getValidAccessToken(userId);

    const body = {
      topic: params.topic,
      type: 2, // Scheduled meeting
      start_time: params.startTime.toISOString(),
      duration: params.durationMinutes,
      timezone: params.timezone || "UTC",
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        waiting_room: true,
        mute_upon_entry: true,
      },
    };

    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`Failed to create Zoom meeting: ${res.status} ${errorText}`);
      throw new BadRequestError("ZOOM_MEETING_CREATION_FAILED", "Failed to dynamically create Zoom meeting room.");
    }

    const data = (await res.json()) as {
      id: number | string;
      join_url: string;
      start_url: string;
      password?: string;
    };

    this.logger.log(`Created dynamic Zoom meeting ${data.id} for host ${userId}`);

    return {
      meetingId: String(data.id),
      joinUrl: data.join_url,
      startUrl: data.start_url,
      password: data.password,
    };
  }

  /**
   * Reschedules an existing Zoom meeting to a new time.
   */
  async updateMeeting(
    userId: string,
    meetingId: string,
    params: {
      startTime: Date;
      durationMinutes: number;
      timezone: string;
    }
  ): Promise<void> {
    try {
      const accessToken = await this.getValidAccessToken(userId);

      const body = {
        start_time: params.startTime.toISOString(),
        duration: params.durationMinutes,
        timezone: params.timezone || "UTC",
      };

      const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok && res.status !== 204) {
        const errorText = await res.text();
        this.logger.warn(`Could not update Zoom meeting ${meetingId}: ${res.status} ${errorText}`);
      } else {
        this.logger.log(`Updated Zoom meeting ${meetingId} schedule`);
      }
    } catch (err) {
      this.logger.warn(`Failed to update Zoom meeting schedule: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Deletes a scheduled Zoom meeting upon booking cancellation.
   */
  async deleteMeeting(userId: string, meetingId: string): Promise<void> {
    try {
      const accessToken = await this.getValidAccessToken(userId);

      const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok && res.status !== 204 && res.status !== 404) {
        const errorText = await res.text();
        this.logger.warn(`Could not delete Zoom meeting ${meetingId}: ${res.status} ${errorText}`);
      } else {
        this.logger.log(`Deleted Zoom meeting ${meetingId} from host account`);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete Zoom meeting: ${err instanceof Error ? err.message : err}`);
    }
  }
}
