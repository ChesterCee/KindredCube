import { BadRequestException, Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PoolClient } from "pg";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";

class SubmitPostMeetCheckDto {
  @IsUUID()
  otherUserId!: string;

  @IsISO8601()
  meetingStartedAt!: string;

  @IsISO8601()
  meetingEndedAt!: string;

  @IsString()
  @MaxLength(500)
  venue!: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsIn(["Yes", "No"])
  plansRespected?: string;

  @IsOptional()
  @IsIn(["Yes", "No"])
  showedUp?: string;

  @IsIn(["Yes", "Mostly", "No"])
  profileMatched!: string;

  @IsOptional()
  @IsIn(["Yes", "No"])
  boundariesRespected?: string;

  @IsOptional()
  @IsIn(["No", "Yes"])
  feltUnsafe?: string;

  @IsOptional()
  @IsIn(["Yes", "Somewhat", "No"])
  feltSafe?: string;

  @IsOptional()
  @IsIn(["Yes", "Mostly", "No"])
  respectful?: string;

  @IsIn(["Yes", "Maybe", "Not sure", "No"])
  wouldMeetAgain!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

@Controller("v1/post-meet-checks")
@UseGuards(AccessTokenGuard)
export class PostMeetChecksController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get("status")
  async status(
    @Req() request: AuthenticatedRequest,
    @Query("otherUserId") otherUserId: string,
    @Query("meetingStartedAt") meetingStartedAtValue: string,
    @Query("venue") venueValue?: string,
  ) {
    if (!isUuid(otherUserId) || request.user.id === otherUserId) {
      throw new BadRequestException("A valid meetup member is required.");
    }
    const meetingStartedAt = new Date(meetingStartedAtValue);
    if (Number.isNaN(meetingStartedAt.getTime())) {
      throw new BadRequestException("Meeting time is invalid.");
    }
    const venue = typeof venueValue === "string" ? venueValue.trim() : "";
    const normalizedVenue = normalizeVenue(venue);
    return this.database.withUser(request.user.id, async (client) => {
      const own = await client.query<{ id: string; counted_for_trust_at: Date | null }>(
        `SELECT id, counted_for_trust_at
           FROM post_meet_checks
          WHERE user_id = $1
            AND other_user_id = $2
            AND (
              meeting_started_at BETWEEN $3::timestamptz - interval '30 days'
                                      AND $3::timestamptz + interval '30 days'
              OR ($4 <> '' AND lower(regexp_replace(trim(venue), '\\s+', ' ', 'g')) = $4)
            )
          ORDER BY ABS(EXTRACT(EPOCH FROM (meeting_started_at - $3::timestamptz))) ASC
          LIMIT 1`,
        [request.user.id, otherUserId, meetingStartedAt, normalizedVenue],
      );
      const other = await client.query<{ id: string }>(
        `SELECT id
           FROM post_meet_checks
          WHERE user_id = $2
            AND other_user_id = $1
            AND (
              meeting_started_at BETWEEN $3::timestamptz - interval '30 days'
                                      AND $3::timestamptz + interval '30 days'
              OR ($4 <> '' AND lower(regexp_replace(trim(venue), '\\s+', ' ', 'g')) = $4)
            )
          ORDER BY ABS(EXTRACT(EPOCH FROM (meeting_started_at - $3::timestamptz))) ASC
          LIMIT 1`,
        [request.user.id, otherUserId, meetingStartedAt, normalizedVenue],
      );
      let counted = Boolean(own.rows[0]?.counted_for_trust_at);
      if (own.rows[0] && other.rows[0] && !counted) {
        const trust = await activateTrustScoreIfBothSubmitted(client, request.user.id, otherUserId, meetingStartedAt);
        counted = trust.counted;
      }
      return {
        submitted: Boolean(own.rows[0]),
        bothSubmitted: Boolean(own.rows[0] && other.rows[0]),
        counted,
      };
    });
  }

  @Post()
  async submit(@Req() request: AuthenticatedRequest, @Body() input: SubmitPostMeetCheckDto) {
    if (request.user.id === input.otherUserId) {
      throw new BadRequestException("Post-meet checks must be for another member.");
    }

    const meetingStartedAt = new Date(input.meetingStartedAt);
    const meetingEndedAt = new Date(input.meetingEndedAt);
    if (Number.isNaN(meetingStartedAt.getTime()) || Number.isNaN(meetingEndedAt.getTime())) {
      throw new BadRequestException("Meeting times are invalid.");
    }
    if (meetingEndedAt <= meetingStartedAt) {
      throw new BadRequestException("Meeting end time must be after start time.");
    }
    if (meetingEndedAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException("The post-meet check opens after the meeting time has passed.");
    }
    if (!input.venue.trim()) {
      throw new BadRequestException("Meeting venue is required.");
    }

    return this.database.withUser(request.user.id, async (client) => {
      const participant = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 AND status = 'active' LIMIT 1",
        [input.otherUserId],
      );
      if (!participant.rowCount) {
        throw new BadRequestException("The other member is not available.");
      }

      const scored = scorePostMeetCheck({
        showedUp: input.showedUp || input.plansRespected || "",
        profileMatched: input.profileMatched,
        feltSafe: input.feltSafe || (input.feltUnsafe === "Yes" ? "No" : input.feltUnsafe === "No" ? "Yes" : ""),
        respectful: input.respectful || (input.boundariesRespected === "Yes" ? "Yes" : input.boundariesRespected === "No" ? "No" : ""),
        wouldMeetAgain: input.wouldMeetAgain === "Not sure" ? "Maybe" : input.wouldMeetAgain,
      });

      const saved = await client.query<{ id: string; created_at: Date }>(
        `
          INSERT INTO post_meet_checks (
            user_id,
            other_user_id,
            meeting_started_at,
            meeting_ended_at,
            venue,
            venue_latitude,
            venue_longitude,
            plans_respected,
            showed_up,
            profile_matched,
            boundaries_respected,
            felt_safe,
            felt_unsafe,
            respectful,
            would_meet_again,
            notes,
            trust_score,
            safety_concern,
            answers_private
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (user_id, other_user_id, meeting_started_at)
          DO UPDATE SET
            meeting_ended_at = EXCLUDED.meeting_ended_at,
            venue = EXCLUDED.venue,
            venue_latitude = EXCLUDED.venue_latitude,
            venue_longitude = EXCLUDED.venue_longitude,
            plans_respected = EXCLUDED.plans_respected,
            showed_up = EXCLUDED.showed_up,
            profile_matched = EXCLUDED.profile_matched,
            boundaries_respected = EXCLUDED.boundaries_respected,
            felt_safe = EXCLUDED.felt_safe,
            felt_unsafe = EXCLUDED.felt_unsafe,
            respectful = EXCLUDED.respectful,
            would_meet_again = EXCLUDED.would_meet_again,
            notes = EXCLUDED.notes,
            trust_score = EXCLUDED.trust_score,
            safety_concern = EXCLUDED.safety_concern,
            answers_private = EXCLUDED.answers_private,
            counted_for_trust_at = NULL,
            updated_at = now()
          RETURNING id, created_at
        `,
        [
          request.user.id,
          input.otherUserId,
          meetingStartedAt,
          meetingEndedAt,
          input.venue.trim(),
          input.latitude ?? null,
          input.longitude ?? null,
          input.plansRespected,
          scored.answers.showedUp,
          input.profileMatched,
          input.boundariesRespected,
          scored.answers.feltSafe,
          input.feltUnsafe,
          scored.answers.respectful,
          input.wouldMeetAgain,
          input.notes?.trim() || null,
          scored.score,
          scored.safetyConcern,
          JSON.stringify(scored.answers),
        ],
      );

      const row = saved.rows[0];
      if (!row) throw new BadRequestException("Post-meet check could not be saved.");
      const trust = await activateTrustScoreIfBothSubmitted(client, request.user.id, input.otherUserId, meetingStartedAt);
      return {
        submitted: true,
        checkId: row.id,
        createdAt: row.created_at.toISOString(),
        privateScore: scored.score,
        counted: trust.counted,
        meetupVerified: trust.meetupVerified,
      };
    });
  }
}

type TrustAnswers = {
  showedUp: string;
  profileMatched: string;
  feltSafe: string;
  respectful: string;
  wouldMeetAgain: string;
};

function scorePostMeetCheck(answers: TrustAnswers) {
  const showedUp = answerValue(answers.showedUp, { Yes: 1, No: -1 });
  const profileMatched = answerValue(answers.profileMatched, { Yes: 1, Mostly: 0.45, No: -1 });
  const feltSafe = answerValue(answers.feltSafe, { Yes: 1, Somewhat: -0.35, No: -1 });
  const respectful = answerValue(answers.respectful, { Yes: 1, Mostly: 0.4, No: -1 });
  const wouldMeetAgain = answerValue(answers.wouldMeetAgain, { Yes: 1, Maybe: 0, No: -1 });
  const weighted =
    showedUp * 0.1 +
    profileMatched * 0.2 +
    feltSafe * 0.4 +
    respectful * 0.2 +
    wouldMeetAgain * 0.1;
  const score = Math.max(-5, Math.min(5, Math.round(weighted * 500) / 100));
  return {
    answers,
    score,
    safetyConcern: answers.feltSafe === "No" || answers.respectful === "No" || answers.showedUp === "No",
  };
}

function answerValue(answer: string, values: Record<string, number>) {
  return values[answer] ?? 0;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function normalizeVenue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function activateTrustScoreIfBothSubmitted(
  client: PoolClient,
  userId: string,
  otherUserId: string,
  meetingStartedAt: Date,
) {
  const pair = await client.query<{
    id: string;
    user_id: string;
    other_user_id: string;
    trust_score: string;
    safety_concern: boolean;
  }>(
    `SELECT id, user_id, other_user_id, trust_score::text, safety_concern
       FROM post_meet_checks
      WHERE ((user_id = $1 AND other_user_id = $2) OR (user_id = $2 AND other_user_id = $1))
        AND meeting_started_at BETWEEN $3::timestamptz - interval '36 hours'
                                   AND $3::timestamptz + interval '36 hours'
      ORDER BY ABS(EXTRACT(EPOCH FROM (meeting_started_at - $3::timestamptz))) ASC`,
    [userId, otherUserId, meetingStartedAt],
  );
  const participantIds = new Set(pair.rows.map((row) => row.user_id));
  if (!participantIds.has(userId) || !participantIds.has(otherUserId)) {
    return { counted: false, meetupVerified: false };
  }

  await client.query(
    `UPDATE post_meet_checks
        SET counted_for_trust_at = COALESCE(counted_for_trust_at, now())
      WHERE id = ANY($1::uuid[])`,
    [pair.rows.map((row) => row.id)],
  );

  let currentUserMeetupVerified = false;
  for (const reviewedUserId of [userId, otherUserId]) {
    const summary = await recalculateTrustScore(client, reviewedUserId);
    if (reviewedUserId === userId) currentUserMeetupVerified = summary.meetupVerified;
  }
  return { counted: true, meetupVerified: currentUserMeetupVerified };
}

async function recalculateTrustScore(client: PoolClient, reviewedUserId: string) {
  const result = await client.query<{
    trust_score: string;
    safety_concern: boolean;
    reviewer_id: string;
  }>(
    `SELECT trust_score::text, safety_concern, user_id AS reviewer_id
       FROM post_meet_checks
      WHERE other_user_id = $1
        AND counted_for_trust_at IS NOT NULL
        AND trust_score IS NOT NULL
      ORDER BY meeting_started_at DESC, updated_at DESC
      LIMIT 10`,
    [reviewedUserId],
  );
  const scores = result.rows.map((row) => Number(row.trust_score)).filter(Number.isFinite);
  const rollingScore = scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100) / 100 : 0;
  const severeSafetySignals = result.rows.filter((row) => row.safety_concern).length;
  const poorMeetups = scores.filter((score) => score <= -1.5).length;
  const excellentMeetups = scores.filter((score) => score >= 3).length;
  const latestTrouble = result.rows[0]?.safety_concern === true || Number(result.rows[0]?.trust_score) < 2;
  const meetupVerified = scores.length >= 1 && rollingScore >= 2.5 && !latestTrouble && severeSafetySignals === 0;
  const disableReadyToMeet = scores.length >= 3 && (rollingScore <= -1.5 || severeSafetySignals >= 2);
  const needsGuidelinesReview = scores.length >= 3 && (rollingScore < 0 || severeSafetySignals >= 2);

  await client.query(
    `INSERT INTO user_trust_scores (
        user_id,
        rolling_score,
        counted_meetups,
        excellent_meetups,
        poor_meetups,
        severe_safety_signals,
        meetup_verified,
        needs_guidelines_review,
        ready_to_meet_disabled_until,
        last_scores
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9 THEN now() + interval '7 days' ELSE NULL END, $10::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET
        rolling_score = EXCLUDED.rolling_score,
        counted_meetups = EXCLUDED.counted_meetups,
        excellent_meetups = EXCLUDED.excellent_meetups,
        poor_meetups = EXCLUDED.poor_meetups,
        severe_safety_signals = EXCLUDED.severe_safety_signals,
        meetup_verified = EXCLUDED.meetup_verified,
        needs_guidelines_review = EXCLUDED.needs_guidelines_review,
        ready_to_meet_disabled_until = EXCLUDED.ready_to_meet_disabled_until,
        last_scores = EXCLUDED.last_scores,
        updated_at = now()`,
    [
      reviewedUserId,
      rollingScore,
      scores.length,
      excellentMeetups,
      poorMeetups,
      severeSafetySignals,
      meetupVerified,
      needsGuidelinesReview,
      disableReadyToMeet,
      JSON.stringify(scores),
    ],
  );
  return { meetupVerified, rollingScore };
}
