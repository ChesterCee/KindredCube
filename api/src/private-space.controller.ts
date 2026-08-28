import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import { createHash } from "node:crypto";
import { IsIn, IsInt, IsObject, IsString, Max, Min } from "class-validator";
import { Response } from "express";
import { DatabaseService } from "./database.service";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { syncDiscoveryProfile } from "./discovery-profile";
import { Throttle } from "@nestjs/throttler";

class UpdatePrivateSpaceDto {
  @IsObject()
  profile!: Record<string, unknown>;

  @IsObject()
  settings!: Record<string, unknown>;
}

class ProfilePhotoUploadDto {
  @IsString()
  imageBase64!: string;

  @IsIn(["image/jpeg", "image/png", "image/webp"])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(8 * 1024 * 1024)
  sizeBytes!: number;
}

class ChatMediaUploadDto {
  @IsString()
  fileBase64!: string;

  @IsIn(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a"])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes!: number;
}

@Controller("v1/me/private-space")
export class PrivateSpaceController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  @UseGuards(AccessTokenGuard)
  read(@Req() request: AuthenticatedRequest) {
    return this.database.withUser(request.user.id, async (client) => {
      const result = await client.query<{ profile_data: object; settings_data: object }>(
        "SELECT profile_data, settings_data FROM user_private_spaces WHERE user_id = $1",
        [request.user.id],
      );
      const row = result.rows[0];
      if (row) {
        row.profile_data = normalizeProfileMediaForResponse(
          row.profile_data as Record<string, unknown>,
          apiOrigin(request),
        );
        await syncDiscoveryProfile(
          client,
          request.user.id,
          row.profile_data as Record<string, unknown>,
          row.settings_data as Record<string, unknown>,
        );
      }
      return { profile: row?.profile_data || {}, settings: row?.settings_data || {} };
    });
  }

  @Put()
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @UseGuards(AccessTokenGuard)
  update(@Req() request: AuthenticatedRequest, @Body() input: UpdatePrivateSpaceDto) {
    validatePrivatePayload(input);
    const normalizedProfile = normalizeProfileMediaForStorage(input.profile);
    return this.database.withUser(request.user.id, async (client) => {
      const photoFingerprints = profilePhotoFingerprints(normalizedProfile);
      if (photoFingerprints.length) {
        normalizedProfile.photoVersion = createHash("sha1").update(photoFingerprints.join("|")).digest("hex").slice(0, 16);
      } else {
        delete normalizedProfile.photoVersion;
      }
      if (photoFingerprints.length) {
        const banned = await client.query(
          `SELECT 1 FROM platform_bans
            WHERE active = true
              AND photo_fingerprints ?| $1::text[]
            LIMIT 1`,
          [photoFingerprints],
        );
        if (banned.rowCount) {
          throw new ForbiddenException("This account cannot use KindredCube.");
        }
      }
      const result = await client.query<{ profile_data: object; settings_data: object }>(
        `INSERT INTO user_private_spaces (user_id, profile_data, settings_data)
         VALUES ($1, $2::jsonb, $3::jsonb)
         ON CONFLICT (user_id) DO UPDATE
            SET profile_data = EXCLUDED.profile_data,
                settings_data = EXCLUDED.settings_data,
                updated_at = now()
         RETURNING profile_data, settings_data`,
        [
          request.user.id,
          JSON.stringify(normalizedProfile),
          JSON.stringify(input.settings),
        ],
      );
      await syncDiscoveryProfile(client, request.user.id, normalizedProfile, input.settings);
      return {
        profile: normalizeProfileMediaForResponse(result.rows[0]!.profile_data as Record<string, unknown>, apiOrigin(request)),
        settings: result.rows[0]!.settings_data,
      };
    });
  }

  @Post("media/profile-photo")
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @UseGuards(AccessTokenGuard)
  uploadProfilePhoto(@Req() request: AuthenticatedRequest, @Body() input: ProfilePhotoUploadDto) {
    if (typeof input.imageBase64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(input.imageBase64)) {
      throw new BadRequestException("Profile photo data is invalid.");
    }
    const data = Buffer.from(input.imageBase64, "base64");
    if (data.length <= 0 || data.length > 8 * 1024 * 1024) {
      throw new BadRequestException("Profile photo must be 8 MB or less.");
    }
    const sha256 = createHash("sha256").update(data).digest("hex");
    return this.database.withUser(request.user.id, async (client) => {
      const banned = await client.query(
        `SELECT 1 FROM platform_bans
          WHERE active = true
            AND photo_fingerprints ? $1
          LIMIT 1`,
        [sha256],
      );
      if (banned.rowCount) throw new ForbiddenException("This account cannot use KindredCube.");
      const result = await client.query<{ id: string; mime_type: string; size_bytes: number }>(
        `INSERT INTO profile_media (user_id, media_type, mime_type, size_bytes, data, sha256)
         VALUES ($1, 'profile_photo', $2, $3, $4, $5)
         RETURNING id, mime_type, size_bytes`,
        [request.user.id, input.mimeType, data.length, data, sha256],
      );
      const row = result.rows[0]!;
      const version = Date.now().toString(36);
      return {
        id: row.id,
        uri: `${apiOrigin(request)}${profileMediaPath(row.id, version)}`,
        path: profileMediaPath(row.id, version),
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
      };
    });
  }

  @Get("media/profile-photo/:mediaId")
  async readProfilePhoto(
    @Param("mediaId") mediaId: string,
    @Res() response: Response,
  ) {
    const result = await this.database.query<{ mime_type: string; data: Buffer; size_bytes: number }>(
      `SELECT mime_type, data, size_bytes
         FROM profile_media
        WHERE id = $1
          AND status = 'active'
        LIMIT 1`,
      [mediaId],
    );
    const row = result.rows[0];
    if (!row) {
      response.status(404).send("Not found");
      return;
    }
    response.setHeader("Content-Type", row.mime_type);
    response.setHeader("Content-Length", String(row.size_bytes));
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("ETag", `"${mediaId}"`);
    response.send(row.data);
  }

  @Post("media/chat")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @UseGuards(AccessTokenGuard)
  uploadChatMedia(@Req() request: AuthenticatedRequest, @Body() input: ChatMediaUploadDto) {
    if (typeof input.fileBase64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(input.fileBase64)) {
      throw new BadRequestException("Chat media data is invalid.");
    }
    const data = Buffer.from(input.fileBase64, "base64");
    const maxBytes = input.mimeType.startsWith("video/")
      ? 50 * 1024 * 1024
      : input.mimeType.startsWith("audio/")
        ? 15 * 1024 * 1024
        : 10 * 1024 * 1024;
    if (data.length <= 0 || data.length > maxBytes) {
      throw new BadRequestException(
        input.mimeType.startsWith("video/")
          ? "Videos must be 50 MB or less."
          : input.mimeType.startsWith("audio/")
            ? "Voice notes must be 15 MB or less."
            : "Photos must be 10 MB or less.",
      );
    }
    const sha256 = createHash("sha256").update(data).digest("hex");
    return this.database.withUser(request.user.id, async (client) => {
      const result = await client.query<{ id: string; mime_type: string; size_bytes: number }>(
        `INSERT INTO profile_media (user_id, media_type, mime_type, size_bytes, data, sha256)
         VALUES ($1, 'chat_media', $2, $3, $4, $5)
         RETURNING id, mime_type, size_bytes`,
        [request.user.id, input.mimeType, data.length, data, sha256],
      );
      const row = result.rows[0]!;
      return {
        id: row.id,
        uri: `${apiOrigin(request)}${profileMediaPath(row.id)}`,
        path: profileMediaPath(row.id),
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
      };
    });
  }
}

function apiOrigin(request: AuthenticatedRequest) {
  const configured = process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = request.get("host");
  return `${request.protocol}://${host}`;
}

function profileMediaPath(id: string, version?: string) {
  const path = `/v1/me/private-space/media/profile-photo/${id}`;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

function normalizeProfileMediaForStorage(profile: Record<string, unknown>) {
  const next = { ...profile };
  const normalize = (uri: unknown) => {
    if (typeof uri !== "string") return uri;
    return mediaPathFromUri(uri) || uri;
  };
  if (Array.isArray(next.photos)) {
    next.photos = next.photos
      .map((photo) => {
        if (!photo || typeof photo !== "object") return photo;
        const item = { ...(photo as Record<string, unknown>) };
        item.uri = normalize(item.uri);
        return item;
      })
      .filter((photo) => {
        if (!photo || typeof photo !== "object") return false;
        const uri = (photo as Record<string, unknown>).uri;
        return typeof uri === "string" && uri.trim().length > 0 && !isLocalOnlyMediaUri(uri);
      });
  }
  if (typeof next.bestPhotoUri === "string") {
    const normalizedBestPhotoUri = normalize(next.bestPhotoUri);
    next.bestPhotoUri = typeof normalizedBestPhotoUri === "string" && !isLocalOnlyMediaUri(normalizedBestPhotoUri) ? normalizedBestPhotoUri : "";
  }
  return next;
}

function normalizeProfileMediaForResponse(profile: Record<string, unknown>, origin: string) {
  const next = { ...profile };
  const photoVersion = typeof next.photoVersion === "string" ? next.photoVersion.trim() : "";
  const normalize = (uri: unknown) => {
    const path = mediaPathFromUri(typeof uri === "string" ? uri : "");
    return path ? `${origin}${versionedMediaPath(path, photoVersion)}` : uri;
  };
  if (Array.isArray(next.photos)) {
    next.photos = next.photos
      .map((photo) => {
        if (!photo || typeof photo !== "object") return photo;
        const item = { ...(photo as Record<string, unknown>) };
        item.uri = normalize(item.uri);
        return item;
      })
      .filter((photo) => {
        if (!photo || typeof photo !== "object") return false;
        const uri = (photo as Record<string, unknown>).uri;
        return typeof uri === "string" && uri.trim().length > 0 && !isLocalOnlyMediaUri(uri);
      });
  }
  if (typeof next.bestPhotoUri === "string") {
    const normalizedBestPhotoUri = normalize(next.bestPhotoUri);
    next.bestPhotoUri = typeof normalizedBestPhotoUri === "string" && !isLocalOnlyMediaUri(normalizedBestPhotoUri) ? normalizedBestPhotoUri : "";
  }
  return next;
}

function mediaPathFromUri(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/\/v1\/me\/private-space\/media\/profile-photo\/[0-9a-f-]{36}/i);
  return match?.[0] || "";
}

function versionedMediaPath(path: string, version: string) {
  if (!version) return path;
  return `${path}?v=${encodeURIComponent(version)}`;
}

function isLocalOnlyMediaUri(uri: string) {
  return /^file:|^content:|^ph:|^assets-library:|^blob:/i.test(uri.trim());
}

function profilePhotoFingerprints(profile: Record<string, unknown>) {
  const photos = Array.isArray(profile.photos) ? profile.photos : [];
  const values = photos
    .map((photo) => photo && typeof photo === "object" ? (photo as Record<string, unknown>).uri : undefined)
    .filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0);
  const best = typeof profile.bestPhotoUri === "string" ? profile.bestPhotoUri : "";
  return [...new Set([...values, best].filter(Boolean).map((value) => createHash("sha256").update(value.trim()).digest("hex")))];
}

function validatePrivatePayload(input: UpdatePrivateSpaceDto) {
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized, "utf8") > 96_000) {
    throw new BadRequestException("Profile data is too large. Upload photos as media rather than embedding files.");
  }
  inspectJson(input, 0);
  if (Array.isArray(input.profile.photos) && input.profile.photos.length > 9) {
    throw new BadRequestException("A profile can contain at most 9 photos.");
  }
}

function inspectJson(value: unknown, depth: number) {
  if (depth > 10) throw new BadRequestException("Profile data is nested too deeply.");
  if (typeof value === "string" && value.length > 8_000) {
    throw new BadRequestException("A profile field is too long.");
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new BadRequestException("A profile list contains too many items.");
    value.forEach((item) => inspectJson(item, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") return;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 100) throw new BadRequestException("A profile object contains too many fields.");
  for (const [key, child] of entries) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw new BadRequestException("Profile data contains an unsafe field name.");
    }
    inspectJson(child, depth + 1);
  }
}
