import { BadRequestException, Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsISO8601, IsNumber, IsOptional } from "class-validator";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { ChatRealtimeService } from "./chat-realtime.service";
import { DatabaseService } from "./database.service";
import { syncDiscoveryProfile } from "./discovery-profile";

type DiscoveryRow = {
  user_id: string;
  display_name: string;
  gender: "Man" | "Woman" | "Nonbinary";
  seeking: "Women" | "Men" | "Everyone";
  date_of_birth: string;
  culture: string;
  occupation: string;
  matching_data: Record<string, unknown>;
  area_latitude: number | null;
  area_longitude: number | null;
  recently_active_at: string;
  identity_verified: boolean;
  selfie_verified: boolean;
  meetup_verified: boolean;
  trust_score: string | null;
};

type DiscoveryRules = {
  minAge: number;
  maxAge: number;
  maximumDistanceKm: number;
  openToRelocate: boolean;
};

type PrivateSpaceRow = {
  profile_data: Record<string, unknown>;
  settings_data: Record<string, unknown>;
};

class ReadyToMeetAvailabilityDto {
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsISO8601()
  availableAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

@Controller("v1/discovery")
@UseGuards(AccessTokenGuard)
export class DiscoveryController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ChatRealtimeService) private readonly realtime: ChatRealtimeService,
  ) {}

  @Get("candidates")
  candidates(@Req() request: AuthenticatedRequest) {
    return this.database.withUser(request.user.id, async (client) => {
      const viewerResult = await client.query<DiscoveryRow>(
        `SELECT d.*, false AS identity_verified, false AS selfie_verified, false AS meetup_verified, NULL::text AS trust_score
           FROM discovery_profiles d
          WHERE d.user_id = $1`,
        [request.user.id],
      );
      const viewer = viewerResult.rows[0];
      if (!viewer) return { candidates: [] };
      const viewerAge = ageFromDate(viewer.date_of_birth);
      const viewerRules = rulesFromMatchingData(viewer.matching_data);
      const result = await client.query<DiscoveryRow>(
        `SELECT d.user_id,
                d.display_name,
                d.gender,
                d.seeking,
                d.date_of_birth,
                d.culture,
                d.occupation,
                d.matching_data,
                d.area_latitude,
                d.area_longitude,
                d.recently_active_at,
                ${publicMeetupVerifiedSql("d.user_id")} AS meetup_verified,
                ts.rolling_score::text AS trust_score,
                ${publicStripeVerifiedSql("d.user_id")} AS identity_verified,
                ${publicSelfieVerifiedSql("d.user_id")} AS selfie_verified
           FROM discovery_profiles d
           JOIN users u ON u.id = d.user_id
           LEFT JOIN user_trust_scores ts ON ts.user_id = d.user_id
          WHERE d.user_id <> $1
            AND d.visible = true
            AND u.status = 'active'
            AND u.email_verified_at IS NOT NULL
            AND COALESCE((d.matching_data->>'profileStrength')::numeric, 0) >= 25
            AND NOT EXISTS (
              SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = $1 AND b.blocked_profile_id = d.user_id::text)
                  OR (b.blocker_id = d.user_id AND b.blocked_profile_id = $1::text)
            )
            AND NOT EXISTS (
              SELECT 1 FROM member_likes ml
               WHERE (
                 (ml.liker_id = $1 AND ml.liked_user_id = d.user_id)
                 OR (ml.liker_id = d.user_id AND ml.liked_user_id = $1)
               )
                 AND ml.chat_started_at IS NOT NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM chat_messages cm
               WHERE (cm.sender_id = $1 AND cm.recipient_id = d.user_id)
                  OR (cm.sender_id = d.user_id AND cm.recipient_id = $1)
            )
          ORDER BY COALESCE(ts.rolling_score, 0) DESC, d.recently_active_at DESC
          LIMIT 100`,
        [request.user.id],
      );
      const candidates = result.rows
        .map((candidate) => {
          const age = ageFromDate(candidate.date_of_birth);
          const distanceKm = areaDistance(viewer, candidate);
          const candidateRules = rulesFromMatchingData(candidate.matching_data);
          return { candidate, age, distanceKm, candidateRules };
        })
        .filter(({ candidate, age, distanceKm, candidateRules }) =>
          seekingAllows(viewer.seeking, candidate.gender) &&
          seekingAllows(candidate.seeking, viewer.gender) &&
          age >= viewerRules.minAge &&
          age <= viewerRules.maxAge &&
          viewerAge >= candidateRules.minAge &&
          viewerAge <= candidateRules.maxAge &&
          distanceAllowed(distanceKm, viewerRules, candidateRules)
        )
        .map(({ candidate, age, distanceKm }) => candidateToResponse(candidate, age, distanceKm, apiOrigin(request)));
      return { candidates };
    });
  }

  @Get("ready-to-meet")
  readyToMeet(@Req() request: AuthenticatedRequest) {
    return this.database.withUser(request.user.id, async (client) => {
      const viewerResult = await client.query<DiscoveryRow>(
        `SELECT d.*, false AS identity_verified, false AS selfie_verified, false AS meetup_verified, NULL::text AS trust_score
           FROM discovery_profiles d
          WHERE d.user_id = $1`,
        [request.user.id],
      );
      const viewer = viewerResult.rows[0];
      if (!viewer) return { candidates: [] };
      const result = await client.query<DiscoveryRow>(
        `SELECT d.user_id,
                d.display_name,
                d.gender,
                d.seeking,
                d.date_of_birth,
                d.culture,
                d.occupation,
                d.matching_data,
                d.area_latitude,
                d.area_longitude,
                d.recently_active_at,
                ${publicMeetupVerifiedSql("d.user_id")} AS meetup_verified,
                ts.rolling_score::text AS trust_score,
                ${publicStripeVerifiedSql("d.user_id")} AS identity_verified,
                ${publicSelfieVerifiedSql("d.user_id")} AS selfie_verified
           FROM discovery_profiles d
           JOIN users u ON u.id = d.user_id
           LEFT JOIN user_trust_scores ts ON ts.user_id = d.user_id
          WHERE d.user_id <> $1
            AND d.visible = true
            AND u.status = 'active'
            AND d.matching_data ->> 'readyToMeet' = 'true'
            AND d.matching_data ->> 'readyToMeetAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
            AND d.matching_data ->> 'readyToMeetExpiresAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
            AND NULLIF(d.matching_data ->> 'readyToMeetAt', '')::timestamptz <= now()
            AND NULLIF(d.matching_data ->> 'readyToMeetExpiresAt', '')::timestamptz > now()
            AND (ts.ready_to_meet_disabled_until IS NULL OR ts.ready_to_meet_disabled_until <= now())
            AND NOT EXISTS (
              SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = $1 AND b.blocked_profile_id = d.user_id::text)
                  OR (b.blocker_id = d.user_id AND b.blocked_profile_id = $1::text)
            )
          ORDER BY COALESCE(ts.rolling_score, 0) DESC, d.recently_active_at DESC
          LIMIT 100`,
        [request.user.id],
      );
      const candidates = result.rows
        .map((candidate) => {
          const age = ageFromDate(candidate.date_of_birth);
          const distanceKm = areaDistance(viewer, candidate);
          return { candidate, age, distanceKm };
        })
        .map(({ candidate, age, distanceKm }) => candidateToResponse(candidate, age, distanceKm, apiOrigin(request)));
      return { candidates };
    });
  }

  @Post("ready-to-meet")
  saveReadyToMeet(@Req() request: AuthenticatedRequest, @Body() input: ReadyToMeetAvailabilityDto) {
    return this.database.withUser(request.user.id, async (client) => {
      const current = await client.query<PrivateSpaceRow>(
        "SELECT profile_data, settings_data FROM user_private_spaces WHERE user_id = $1 FOR UPDATE",
        [request.user.id],
      );
      const row = current.rows[0] || { profile_data: {}, settings_data: {} };
      const profile = { ...(row.profile_data || {}) };
      const settings = { ...(row.settings_data || {}) };
      const availability = normalizeAvailability(input);
      if (availability.available) {
        const latitude = finiteCoordinate(input.latitude, -90, 90);
        const longitude = finiteCoordinate(input.longitude, -180, 180);
        if (latitude !== null && longitude !== null) {
          profile.matchingLocation = {
            ...(record(profile.matchingLocation)),
            latitude,
            longitude,
          };
        }
      }
      settings.readyToMeetAvailability = availability;
      const result = await client.query<PrivateSpaceRow>(
        `INSERT INTO user_private_spaces (user_id, profile_data, settings_data)
         VALUES ($1, $2::jsonb, $3::jsonb)
         ON CONFLICT (user_id) DO UPDATE
            SET profile_data = EXCLUDED.profile_data,
                settings_data = EXCLUDED.settings_data,
                updated_at = now()
         RETURNING profile_data, settings_data`,
        [request.user.id, JSON.stringify(profile), JSON.stringify(settings)],
      );
      await syncDiscoveryProfile(client, request.user.id, result.rows[0]!.profile_data, result.rows[0]!.settings_data);
      let publicReadyProfile: unknown;
      if (availability.available) {
        const readyProfile = await client.query<DiscoveryRow>(
          `SELECT d.user_id,
                  d.display_name,
                  d.gender,
                  d.seeking,
                  d.date_of_birth,
                  d.culture,
                  d.occupation,
                  d.matching_data,
                  d.area_latitude,
                  d.area_longitude,
                  d.recently_active_at,
                  ${publicMeetupVerifiedSql("d.user_id")} AS meetup_verified,
                  ts.rolling_score::text AS trust_score,
                  ${publicStripeVerifiedSql("d.user_id")} AS identity_verified,
                  ${publicSelfieVerifiedSql("d.user_id")} AS selfie_verified
             FROM discovery_profiles d
             LEFT JOIN user_trust_scores ts ON ts.user_id = d.user_id
            WHERE d.user_id = $1`,
          [request.user.id],
        );
        if (readyProfile.rows[0]) {
          publicReadyProfile = candidateToResponse(readyProfile.rows[0], ageFromDate(readyProfile.rows[0].date_of_birth), undefined, apiOrigin(request));
        }
      }
      this.realtime.publishReadyToMeetPresence({
        userId: request.user.id,
        available: availability.available === true,
        availableAt: availability.available ? availability.availableAt : undefined,
        expiresAt: availability.available ? availability.expiresAt : undefined,
        profile: publicReadyProfile,
      });
      return {
        availability,
        profile: result.rows[0]!.profile_data,
        settings: result.rows[0]!.settings_data,
      };
    });
  }
}

function activeMatchingData(matching: Record<string, unknown>): Record<string, unknown> {
  const readyToMeet = matching.readyToMeet === true
    && typeof matching.readyToMeetAt === "string"
    && typeof matching.readyToMeetExpiresAt === "string"
    && new Date(matching.readyToMeetAt).getTime() <= Date.now()
    && new Date(matching.readyToMeetExpiresAt).getTime() > Date.now();
  return { ...matching, readyToMeet };
}

function candidateToResponse(candidate: DiscoveryRow, age: number, distanceKm: number | undefined, origin: string) {
  const matching = activeMatchingData(candidate.matching_data || {});
  const photoVersion = typeof matching.photoVersion === "string" ? matching.photoVersion : "";
  const photoUris = Array.isArray(matching.photos)
    ? matching.photos
        .map((photo) => photo && typeof photo === "object" && "uri" in photo ? (photo as { uri?: unknown }).uri : undefined)
        .map((uri) => publicMediaUri(uri, origin, photoVersion))
        .filter((uri): uri is string => uri.length > 0)
    : [];
  const bestPhotoUri = publicMediaUri(
    typeof matching.bestPhotoUri === "string" ? matching.bestPhotoUri : undefined,
    origin,
    photoVersion,
  );
  return {
    id: candidate.user_id,
    name: candidate.display_name,
    gender: candidate.gender,
    seeking: candidate.seeking,
    age,
    culture: candidate.culture || "Open culture",
    role: candidate.occupation || "",
    photoUri: bestPhotoUri || photoUris[0],
    photoUris,
    contactVerified: true,
    idVerified: candidate.identity_verified,
    selfieVerified: candidate.selfie_verified,
    meetupVerified: candidate.meetup_verified,
    recentlyActive: Date.now() - new Date(candidate.recently_active_at).getTime() <= 14 * 24 * 60 * 60 * 1000,
    distanceKm,
    matching,
  };
}

function publicMediaUri(uri: unknown, origin: string, photoVersion = "") {
  if (typeof uri !== "string") return "";
  const trimmed = uri.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/\/v1\/me\/private-space\/media\/profile-photo\/[0-9a-f-]{36}/i);
  if (match?.[0]) return `${origin}${versionedMediaPath(match[0], photoVersion)}`;
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : "";
}

function versionedMediaPath(path: string, version: string) {
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

function apiOrigin(request: AuthenticatedRequest) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const protocol = proto || request.protocol || "http";
  return `${protocol}://${host || request.get("host")}`;
}

function seekingAllows(seeking: DiscoveryRow["seeking"], gender: DiscoveryRow["gender"]) {
  return seeking === "Everyone" || (seeking === "Women" && gender === "Woman") || (seeking === "Men" && gender === "Man");
}

function ageFromDate(value: string) {
  const birth = new Date(value);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function areaDistance(first: DiscoveryRow, second: DiscoveryRow) {
  if (first.area_latitude === null || first.area_longitude === null || second.area_latitude === null || second.area_longitude === null) return undefined;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.area_latitude - first.area_latitude);
  const longitudeDelta = radians(second.area_longitude - first.area_longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.area_latitude)) * Math.cos(radians(second.area_latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function rulesFromMatchingData(value: Record<string, unknown>): DiscoveryRules {
  return {
    minAge: boundedNumber(value.minAge, 18, 100, 18),
    maxAge: boundedNumber(value.maxAge, 18, 100, 100),
    maximumDistanceKm: boundedNumber(value.maximumDistanceKm, 1, 500, 80),
    openToRelocate: value.openToRelocate === true,
  };
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum ? numeric : null;
}

function normalizeAvailability(input: ReadyToMeetAvailabilityDto) {
  if (input.available !== true) return { available: false };
  const startsAt = typeof input.availableAt === "string" ? new Date(input.availableAt) : null;
  const expiresAt = typeof input.expiresAt === "string" ? new Date(input.expiresAt) : null;
  if (!startsAt || !expiresAt || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(expiresAt.getTime())) {
    throw new BadRequestException("Choose a valid Ready to Meet time window.");
  }
  const now = Date.now();
  if (expiresAt.getTime() <= now) throw new BadRequestException("Ready to Meet must end in the future.");
  const effectiveStartsAt = startsAt.getTime() <= now + 120_000 ? new Date(now) : startsAt;
  if (expiresAt.getTime() <= effectiveStartsAt.getTime()) throw new BadRequestException("Ready to Meet end time must be after the start time.");
  return {
    available: true,
    availableAt: effectiveStartsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function distanceAllowed(distanceKm: number | undefined, viewerRules: DiscoveryRules, candidateRules: DiscoveryRules) {
  if (distanceKm === undefined) return true;
  if (distanceKm <= viewerRules.maximumDistanceKm && distanceKm <= candidateRules.maximumDistanceKm) return true;
  return viewerRules.openToRelocate || candidateRules.openToRelocate;
}

function publicMeetupVerifiedSql(userExpression: string) {
  return `(COALESCE(ts.meetup_verified, false) OR EXISTS (
    SELECT 1
      FROM post_meet_checks pm
     WHERE pm.other_user_id = ${userExpression}
       AND COALESCE(pm.safety_concern, false) = false
       AND COALESCE(pm.trust_score, 0) >= 2.5
       AND EXISTS (
         SELECT 1
           FROM post_meet_checks reciprocal
          WHERE reciprocal.user_id = ${userExpression}
            AND reciprocal.other_user_id = pm.user_id
            AND reciprocal.meeting_started_at BETWEEN pm.meeting_started_at - interval '36 hours'
                                                  AND pm.meeting_started_at + interval '36 hours'
       )
  ))`;
}

function publicStripeVerifiedSql(userExpression: string) {
  return `public_identity_verified(${userExpression})`;
}

function publicSelfieVerifiedSql(userExpression: string) {
  return `public_selfie_verified(${userExpression})`;
}

