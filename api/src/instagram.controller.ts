import { BadRequestException, Body, Controller, Get, Inject, InternalServerErrorException, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { IsArray, IsString, ArrayMaxSize } from "class-validator";
import { randomBytes, createHash } from "node:crypto";
import { Response } from "express";
import { DatabaseService } from "./database.service";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";

type InstagramMedia = {
  id: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
};

class ImportInstagramPhotosDto {
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  mediaIds!: string[];
}

@Controller("v1/instagram")
export class InstagramController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get("connect")
  @UseGuards(AccessTokenGuard)
  async connect(@Req() request: AuthenticatedRequest) {
    const config = instagramConfig();
    const state = randomBytes(24).toString("hex");
    await this.database.withUser(request.user.id, async (client) => {
      await client.query("DELETE FROM instagram_oauth_states WHERE user_id = $1 OR expires_at < now()", [request.user.id]);
      await client.query(
        `INSERT INTO instagram_oauth_states (state, user_id, expires_at)
         VALUES ($1, $2, now() + interval '10 minutes')`,
        [state, request.user.id],
      );
    });
    const authUrl = new URL("https://www.instagram.com/oauth/authorize");
    authUrl.searchParams.set("client_id", config.appId);
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", config.scopes);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("enable_fb_login", "0");
    authUrl.searchParams.set("force_authentication", "1");
    return {
      authUrl: authUrl.toString(),
      returnUrl: config.appReturnUri,
    };
  }

  @Get("callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Res() response: Response) {
    const config = instagramConfig();
    const appReturn = new URL(config.appReturnUri);
    if (!code || !state) {
      appReturn.searchParams.set("status", "failed");
      response.redirect(appReturn.toString());
      return;
    }
    const stateResult = await this.database.query<{ user_id: string }>(
      `SELECT user_id FROM instagram_oauth_states WHERE state = $1 AND expires_at > now() LIMIT 1`,
      [state],
    );
    const stateRow = stateResult.rows[0];
    if (!stateRow) {
      appReturn.searchParams.set("status", "expired");
      response.redirect(appReturn.toString());
      return;
    }
    try {
      const token = await exchangeInstagramCode(code, config);
      const longToken = await exchangeLongLivedToken(token.accessToken, config).catch(() => null);
      const accessToken = longToken?.accessToken || token.accessToken;
      const expiresAt = longToken?.expiresIn
        ? new Date(Date.now() + longToken.expiresIn * 1000).toISOString()
        : null;
      await this.database.withUser(stateRow.user_id, async (client) => {
        await client.query(
          `INSERT INTO instagram_connections (user_id, instagram_user_id, access_token, token_expires_at, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (user_id) DO UPDATE
             SET instagram_user_id = EXCLUDED.instagram_user_id,
                 access_token = EXCLUDED.access_token,
                 token_expires_at = EXCLUDED.token_expires_at,
                 updated_at = now()`,
          [stateRow.user_id, token.userId, accessToken, expiresAt],
        );
        await client.query("DELETE FROM instagram_oauth_states WHERE state = $1", [state]);
      });
      appReturn.searchParams.set("status", "connected");
      response.redirect(appReturn.toString());
    } catch {
      appReturn.searchParams.set("status", "failed");
      response.redirect(appReturn.toString());
    }
  }

  @Get("media")
  @UseGuards(AccessTokenGuard)
  async media(@Req() request: AuthenticatedRequest) {
    const accessToken = await this.getAccessToken(request.user.id);
    const media = await fetchInstagramMedia(accessToken);
    return {
      media: media
        .filter((item) => item.media_type === "IMAGE" || item.media_type === "CAROUSEL_ALBUM")
        .map((item) => ({
          id: item.id,
          mediaType: item.media_type || "IMAGE",
          mediaUrl: item.media_url || item.thumbnail_url || "",
          thumbnailUrl: item.thumbnail_url || item.media_url || "",
          permalink: item.permalink || "",
          caption: item.caption || "",
          timestamp: item.timestamp || "",
        }))
        .filter((item) => item.mediaUrl),
    };
  }

  @Post("import")
  @UseGuards(AccessTokenGuard)
  async importPhotos(@Req() request: AuthenticatedRequest, @Body() input: ImportInstagramPhotosDto) {
    if (!input.mediaIds?.length) throw new BadRequestException("Choose at least one Instagram photo.");
    const accessToken = await this.getAccessToken(request.user.id);
    const media = await fetchInstagramMedia(accessToken);
    const selected = media.filter((item) => input.mediaIds.includes(item.id)).slice(0, 9);
    if (!selected.length) throw new BadRequestException("Those Instagram photos could not be found.");
    const imported: Array<{ id: string; uri: string; path: string; mimeType: string; sizeBytes: number; source: "instagram" }> = [];
    await this.database.withUser(request.user.id, async (client) => {
      for (const item of selected) {
        const url = item.media_url || item.thumbnail_url;
        if (!url) continue;
        const imageResponse = await fetch(url);
        if (!imageResponse.ok) continue;
        const contentType = normalizeImageMimeType(imageResponse.headers.get("content-type"));
        if (!contentType) continue;
        const data = Buffer.from(await imageResponse.arrayBuffer());
        if (data.length <= 0 || data.length > 8 * 1024 * 1024) continue;
        const sha256 = createHash("sha256").update(data).digest("hex");
        const result = await client.query<{ id: string; mime_type: string; size_bytes: number }>(
          `INSERT INTO profile_media (user_id, mime_type, size_bytes, data, sha256)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, mime_type, size_bytes`,
          [request.user.id, contentType, data.length, data, sha256],
        );
        const row = result.rows[0]!;
        const path = `/v1/me/private-space/media/profile-photo/${row.id}`;
        imported.push({
          id: row.id,
          uri: `${apiOrigin(request)}${path}`,
          path,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          source: "instagram",
        });
      }
    });
    if (!imported.length) throw new BadRequestException("Instagram photos could not be imported. Please try different photos.");
    return { photos: imported };
  }

  private async getAccessToken(userId: string) {
    const result = await this.database.withUser(userId, async (client) =>
      client.query<{ access_token: string }>(
        "SELECT access_token FROM instagram_connections WHERE user_id = $1 LIMIT 1",
        [userId],
      ),
    );
    const token = result.rows[0]?.access_token;
    if (!token) throw new BadRequestException("Connect Instagram first.");
    return token;
  }
}

function instagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID || "";
  const appSecret = process.env.INSTAGRAM_APP_SECRET || "";
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || "";
  const apiVersion = process.env.INSTAGRAM_API_VERSION || "v26.0";
  const scopes = process.env.INSTAGRAM_OAUTH_SCOPES || "instagram_business_basic";
  const appReturnUri = process.env.INSTAGRAM_APP_REDIRECT_URI || "kindredcube://instagram-connected";
  if (!appId || !appSecret || !redirectUri) {
    throw new InternalServerErrorException("Instagram photo import is not configured yet.");
  }
  return { appId, appSecret, redirectUri, apiVersion, scopes, appReturnUri };
}

async function exchangeInstagramCode(code: string, config: ReturnType<typeof instagramConfig>) {
  const form = new URLSearchParams();
  form.set("client_id", config.appId);
  form.set("client_secret", config.appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", config.redirectUri);
  form.set("code", code);
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: form,
  });
  const data = await response.json() as { access_token?: string; user_id?: number | string };
  if (!response.ok || !data.access_token) throw new Error("Instagram authorization failed");
  return { accessToken: data.access_token, userId: data.user_id ? String(data.user_id) : "" };
}

async function exchangeLongLivedToken(accessToken: string, config: ReturnType<typeof instagramConfig>) {
  const url = new URL(`https://graph.instagram.com/${config.apiVersion}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) throw new Error("Instagram token exchange failed");
  return { accessToken: data.access_token, expiresIn: data.expires_in || 0 };
}

async function fetchInstagramMedia(accessToken: string) {
  const version = process.env.INSTAGRAM_API_VERSION || "v26.0";
  const url = new URL(`https://graph.instagram.com/${version}/me/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const data = await response.json() as { data?: InstagramMedia[] };
  if (!response.ok) throw new BadRequestException("Instagram photos could not be loaded.");
  return Array.isArray(data.data) ? data.data : [];
}

function normalizeImageMimeType(value: string | null) {
  const lower = (value || "").split(";")[0]?.trim().toLowerCase();
  if (lower === "image/jpeg" || lower === "image/png" || lower === "image/webp") return lower;
  return "";
}

function apiOrigin(request: AuthenticatedRequest) {
  const configured = process.env.PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const proto = String(request.headers["x-forwarded-proto"] || request.protocol || "http").split(",")[0];
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return `${proto}://${host}`;
}
