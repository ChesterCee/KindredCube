import { BadGatewayException, BadRequestException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { IndexFacesCommand, RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import Stripe from "stripe";
import { DatabaseService } from "./database.service";

type StoredVerification = {
  provider_session_id: string;
  provider: "stripe" | "kindredcube";
  verification_type: "document_and_selfie" | "video_selfie";
  status: "requires_input" | "processing" | "verified" | "canceled" | "redacted";
  last_error_code: string | null;
  verified_at: string | null;
  created_at?: string | null;
};

type VideoSelfieReview = {
  approved: boolean;
  confidence: number;
  reasonCode: string;
  notes: string;
};

type FaceTemplateResult = {
  ok: boolean;
  provider: string;
  templateVersion: string;
  templateBase64: string;
  duplicateFingerprintSource: string;
  reasonCode?: string;
};

@Injectable()
export class IdentityVerificationService {
  private readonly stripe: Stripe | null;
  private readonly liveMode: boolean;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    const secret = process.env.STRIPE_SECRET_KEY;
    this.stripe = secret ? new Stripe(secret) : null;
    this.liveMode = Boolean(secret?.startsWith("sk_live_"));
  }

  private client() {
    if (!this.stripe) {
      throw new ServiceUnavailableException("Stripe Identity is not configured.");
    }
    return this.stripe;
  }

  async createSession(userId: string) {
    if (
      this.liveMode &&
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_LIVE_STRIPE_IDENTITY !== "true"
    ) {
      throw new ServiceUnavailableException(
        "Live Stripe Identity is disabled in development. Configure Stripe test-mode keys before testing.",
      );
    }
    const account = await this.database.withUser(userId, async (client) => {
      const user = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
      const existing = await client.query<StoredVerification>(
        `SELECT provider_session_id, provider, verification_type, status, last_error_code, verified_at
         FROM identity_verification_sessions
         ORDER BY created_at DESC
         LIMIT 1`,
      );
      return { email: user.rows[0]?.email, existing: existing.rows[0] };
    });
    if (!account.email) throw new BadGatewayException("The signed-in account could not be found.");
    if (account.existing?.status === "verified") {
      const faceEnrolled = await this.hasActiveFaceTemplate(userId);
      if (account.existing.provider === "kindredcube" && account.existing.verification_type === "video_selfie") {
        return {
          status: "verified" as const,
          verifiedAt: account.existing.verified_at,
          verificationMethod: "video_selfie" as const,
          lastErrorCode: account.existing.last_error_code,
          url: null,
        };
      }
      return {
        status: "verified" as const,
        verifiedAt: account.existing.verified_at,
        verificationMethod: "stripe_identity" as const,
        biometricFaceEnrolled: faceEnrolled,
        url: null,
      };
    }
    if (account.existing && ["requires_input", "processing"].includes(account.existing.status)) {
      const current = await this.client().identity.verificationSessions.retrieve(account.existing.provider_session_id);
      if (current.status === "requires_input" && current.url) {
        return { status: current.status, url: current.url };
      }
      if (current.status === "processing") return { status: current.status, url: null };
    }

    const session = await this.client().identity.verificationSessions.create({
      type: "document",
      provided_details: { email: account.email },
      options: {
        document: {
          require_matching_selfie: true,
          allowed_types: ["driving_license", "passport", "id_card"],
        },
      },
      metadata: { user_id: userId },
    });
    await this.database.withUser(userId, (client) =>
      client.query(
        `INSERT INTO identity_verification_sessions
          (user_id, provider, provider_session_id, verification_type, status)
         VALUES ($1, 'stripe', $2, 'document_and_selfie', $3)`,
        [userId, session.id, session.status],
      ),
    );
    return { status: session.status, url: session.url };
  }

  async createVideoSelfie(userId: string, input: {
    videoBase64: string;
    mimeType: string;
    sizeBytes: number;
    consentAccepted: boolean;
    faceImageBase64?: string;
    faceImageMimeType?: string;
  }) {
    if (!input.consentAccepted) {
      throw new BadRequestException("Consent is required before submitting a video selfie.");
    }
    if (!["video/mp4", "video/quicktime", "video/mov"].includes(input.mimeType)) {
      throw new BadRequestException("Use an MP4 or MOV video selfie.");
    }
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > 15 * 1024 * 1024) {
      throw new BadRequestException("Video selfie must be 15 MB or less.");
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(input.videoBase64) || input.videoBase64.length < 500) {
      throw new BadRequestException("Video selfie data is invalid.");
    }
    if (input.faceImageBase64) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(input.faceImageMimeType || "")) {
        throw new BadRequestException("Use a JPEG, PNG, or WEBP face frame.");
      }
      if (!/^[A-Za-z0-9+/=]+$/.test(input.faceImageBase64) || input.faceImageBase64.length < 500) {
        throw new BadRequestException("Face frame data is invalid.");
      }
    }
    const providerSessionId = `video_selfie:${randomUUID()}`;
    const review = await this.reviewVideoSelfie(input.videoBase64, input.mimeType, input.sizeBytes);
    const faceTemplate = review.approved
      ? await this.createFaceTemplate(input.faceImageBase64 || "")
      : null;
    const status = review.approved && faceTemplate?.ok ? "verified" : "requires_input";
    const reasonCode = !review.approved
      ? review.reasonCode
      : !faceTemplate?.ok
        ? faceTemplate?.reasonCode || "face_template_unavailable"
        : review.reasonCode;
    const shouldRetainRawVideo = process.env.RETAIN_VIDEO_SELFIE_AFTER_REVIEW === "true";
    const encrypted = shouldRetainRawVideo ? this.encryptSecretPayload(input.videoBase64) : null;
    return this.database.withUser(userId, async (client) => {
      let templateId: string | null = null;
      const video = await client.query<{ id: string }>(
        `INSERT INTO video_selfie_verifications
          (user_id, mime_type, size_bytes, ciphertext, iv, auth_tag, status, ai_review_status, ai_confidence, ai_reason_code, ai_review_notes, raw_deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10, CASE WHEN $11::boolean THEN NULL ELSE now() END)
         RETURNING id`,
        [
          userId,
          input.mimeType,
          input.sizeBytes,
          encrypted?.ciphertext || null,
          encrypted?.iv || null,
          encrypted?.authTag || null,
          status,
          review.confidence,
          reasonCode,
          faceTemplate?.reasonCode ? `${review.notes} Face template: ${faceTemplate.reasonCode}`.slice(0, 500) : review.notes,
          shouldRetainRawVideo,
        ],
      );
      if (status === "verified" && faceTemplate?.ok) {
        const duplicateFingerprint = this.faceDuplicateFingerprint(faceTemplate.duplicateFingerprintSource);
        const duplicate = await client.query<{ user_id: string }>(
          `SELECT user_id
             FROM biometric_face_templates
            WHERE duplicate_fingerprint = $1
              AND status = 'active'
              AND user_id <> $2
            LIMIT 1`,
          [duplicateFingerprint, userId],
        );
        if (duplicate.rowCount) {
          await client.query(
            `UPDATE video_selfie_verifications
                SET status = 'requires_input',
                    ai_reason_code = 'possible_duplicate_account',
                    ai_review_notes = 'A matching biometric template already exists for another account.'
              WHERE id = $1`,
            [video.rows[0]!.id],
          );
        } else {
          const encryptedTemplate = this.encryptSecretPayload(faceTemplate.templateBase64);
          const template = await client.query<{ id: string }>(
            `INSERT INTO biometric_face_templates
              (user_id, source_video_selfie_id, provider, template_version, template_ciphertext, template_iv, template_auth_tag, duplicate_fingerprint)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              userId,
              video.rows[0]!.id,
              faceTemplate.provider,
              faceTemplate.templateVersion,
              encryptedTemplate.ciphertext,
              encryptedTemplate.iv,
              encryptedTemplate.authTag,
              duplicateFingerprint,
            ],
          );
          templateId = template.rows[0]!.id;
          await client.query("UPDATE video_selfie_verifications SET face_template_id = $1 WHERE id = $2", [
            templateId,
            video.rows[0]!.id,
          ]);
        }
      }
      const finalStatus = status === "verified" && (!faceTemplate?.ok || !templateId) ? "requires_input" : status;
      await client.query(
        `INSERT INTO identity_verification_sessions
          (user_id, provider, provider_session_id, verification_type, status, verified_at)
         VALUES ($1, 'kindredcube', $2, 'video_selfie', $3, CASE WHEN $3 = 'verified' THEN now() ELSE NULL END)`,
        [userId, providerSessionId, finalStatus],
      );
      return {
        status: finalStatus,
        verificationMethod: "video_selfie" as const,
        verifiedAt: finalStatus === "verified" ? new Date().toISOString() : null,
        reasonCode: finalStatus === "verified" ? "selfie_verified" : reasonCode,
      };
    });
  }

  private async createFaceTemplate(faceImageBase64: string): Promise<FaceTemplateResult> {
    const collectionId = process.env.AWS_REKOGNITION_COLLECTION_ID;
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    if (!faceImageBase64) {
      return {
        ok: false,
        provider: "amazon_rekognition",
        templateVersion: "rekognition-face-id-v1",
        templateBase64: "",
        duplicateFingerprintSource: "",
        reasonCode: "face_frame_required",
      };
    }
    if (!collectionId || !region) {
      return {
        ok: false,
        provider: "amazon_rekognition",
        templateVersion: "none",
        templateBase64: "",
        duplicateFingerprintSource: "",
        reasonCode: "amazon_rekognition_not_configured",
      };
    }
    try {
      const imageBytes = Buffer.from(faceImageBase64, "base64");
      const client = new RekognitionClient({ region });
      const existing = await client.send(new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: { Bytes: imageBytes },
        FaceMatchThreshold: Number(process.env.AWS_REKOGNITION_DUPLICATE_THRESHOLD || 97),
        MaxFaces: 1,
      })).catch((error: unknown) => {
        if (error && typeof error === "object" && "name" in error && String((error as { name?: unknown }).name) === "InvalidParameterException") {
          return { FaceMatches: [] };
        }
        throw error;
      });
      const matchedFaceId = existing.FaceMatches?.[0]?.Face?.FaceId;
      if (matchedFaceId) {
        return {
          ok: true,
          provider: "amazon_rekognition",
          templateVersion: "rekognition-face-id-v1",
          templateBase64: matchedFaceId,
          duplicateFingerprintSource: matchedFaceId,
          reasonCode: "possible_duplicate_account",
        };
      }
      const indexed = await client.send(new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { Bytes: imageBytes },
        DetectionAttributes: ["DEFAULT"],
        MaxFaces: 1,
        QualityFilter: "AUTO",
      }));
      const faceId = indexed.FaceRecords?.[0]?.Face?.FaceId;
      if (!faceId) {
        return {
          ok: false,
          provider: "amazon_rekognition",
          templateVersion: "rekognition-face-id-v1",
          templateBase64: "",
          duplicateFingerprintSource: "",
          reasonCode: "no_indexable_face_detected",
        };
      }
      return {
        ok: true,
        provider: "amazon_rekognition",
        templateVersion: "rekognition-face-id-v1",
        templateBase64: faceId,
        duplicateFingerprintSource: faceId,
      };
    } catch {
      return {
        ok: false,
        provider: "amazon_rekognition",
        templateVersion: "rekognition-face-id-v1",
        templateBase64: "",
        duplicateFingerprintSource: "",
        reasonCode: "amazon_rekognition_unavailable",
      };
    }
  }

  private async reviewVideoSelfie(videoBase64: string, mimeType: string, sizeBytes: number): Promise<VideoSelfieReview> {
    if (sizeBytes < 120_000) {
      return {
        approved: false,
        confidence: 0.12,
        reasonCode: "video_too_short_or_empty",
        notes: "The uploaded video is too small to reliably verify liveness.",
      };
    }
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_VIDEO_SELFIE_REVIEW_MODEL;
    if (!apiKey || !model) {
      return {
        approved: false,
        confidence: 0,
        reasonCode: "ai_review_not_configured",
        notes: "OpenAI AI review key/model is not configured, so Selfie Verified cannot be awarded.",
      };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: "You are a strict identity liveness reviewer for a dating safety feature. Return only JSON. Approve only if a real adult human face is visible, the person follows the requested liveness movements, and there is no obvious replay, image, mask, screen recording, or missing-face issue.",
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Review this video selfie. The expected challenge sequence is: face inside oval, look straight, turn left, turn right, look straight again. Return JSON with keys approved boolean, confidence number 0..1, reasonCode string, notes string.",
                },
                {
                  type: "input_file",
                  filename: mimeType.includes("quicktime") || mimeType.includes("mov") ? "video-selfie.mov" : "video-selfie.mp4",
                  file_data: `data:${mimeType};base64,${videoBase64}`,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "video_selfie_liveness_review",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  approved: { type: "boolean" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  reasonCode: { type: "string" },
                  notes: { type: "string" },
                },
                required: ["approved", "confidence", "reasonCode", "notes"],
              },
            },
          },
        }),
      });
      if (!response.ok) {
        return {
          approved: false,
          confidence: 0,
          reasonCode: "ai_review_failed",
          notes: `AI review service returned ${response.status}.`,
        };
      }
      const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
      const text = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("").trim() || "";
      const parsed = JSON.parse(text) as Partial<VideoSelfieReview>;
      const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
      const approved = parsed.approved === true && confidence >= 0.78;
      return {
        approved,
        confidence,
        reasonCode: typeof parsed.reasonCode === "string" && parsed.reasonCode ? parsed.reasonCode.slice(0, 80) : approved ? "passed_liveness_review" : "failed_liveness_review",
        notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 500) : "",
      };
    } catch {
      return {
        approved: false,
        confidence: 0,
        reasonCode: "ai_review_unavailable",
        notes: "AI review could not be completed. The user must redo verification later.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async status(userId: string) {
    const verifications = await this.database.withUser(userId, async (client) => {
      const result = await client.query<StoredVerification>(
        `SELECT provider_session_id, provider, verification_type, status, last_error_code, verified_at, created_at
         FROM identity_verification_sessions
         ORDER BY created_at DESC
         LIMIT 20`,
      );
      return result.rows;
    });
    const verification = verifications[0];
    if (!verification) return { status: "not_started" as const, verifiedAt: null, lastErrorCode: null };

    const faceEnrolled = await this.hasActiveFaceTemplate(userId);
    const verifiedStripe = verifications.find((row) => row.provider === "stripe" && row.status === "verified");
    const verifiedSelfie = verifications.find(
      (row) => row.provider === "kindredcube" && row.verification_type === "video_selfie" && row.status === "verified",
    );

    if (verifiedStripe) {
      return {
        status: "verified" as const,
        verificationMethod: "stripe_identity" as const,
        verifiedAt: verifiedStripe.verified_at,
        lastErrorCode: verifiedStripe.last_error_code,
        biometricFaceEnrolled: faceEnrolled,
      };
    }

    if (verifiedSelfie) {
      return {
        status: "verified" as const,
        verificationMethod: "video_selfie" as const,
        verifiedAt: verifiedSelfie.verified_at,
        lastErrorCode: verifiedSelfie.last_error_code,
        biometricFaceEnrolled: false,
      };
    }

    if (verification.provider === "kindredcube" && verification.verification_type === "video_selfie") {
      return {
        status: verification.status,
        verificationMethod: "video_selfie" as const,
        verifiedAt: verification.verified_at,
        lastErrorCode: verification.last_error_code,
        biometricFaceEnrolled: false,
      };
    }

    if (!["requires_input", "processing"].includes(verification.status)) {
      return {
        status: verification.status,
        verificationMethod: "stripe_identity" as const,
        verifiedAt: verification.verified_at,
        lastErrorCode: verification.last_error_code,
        biometricFaceEnrolled: false,
      };
    }
    try {
      const current = await this.client().identity.verificationSessions.retrieve(verification.provider_session_id);
      const errorCode = current.last_error?.code || null;
      await this.database.withUser(userId, (client) =>
        client.query(
          `UPDATE identity_verification_sessions
           SET status = $1,
               last_error_code = $2,
               verified_at = CASE WHEN $1 = 'verified' THEN COALESCE(verified_at, now()) ELSE verified_at END,
               updated_at = now()
           WHERE user_id = $3 AND provider_session_id = $4`,
          [current.status, errorCode, userId, current.id],
        ),
      );
      return {
        status: current.status,
        verificationMethod: "stripe_identity" as const,
        verifiedAt: current.status === "verified" ? new Date().toISOString() : verification.verified_at,
        lastErrorCode: errorCode,
        biometricFaceEnrolled: current.status === "verified" ? faceEnrolled : false,
      };
    } catch {
      return {
        status: verification.status,
        verificationMethod: "stripe_identity" as const,
        verifiedAt: verification.verified_at,
        lastErrorCode: verification.last_error_code,
      };
    }
  }

  constructWebhook(rawBody: Buffer, signature: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException("Stripe webhook signing is not configured.");
    return this.client().webhooks.constructEvent(rawBody, signature, secret);
  }

  async processWebhook(event: Stripe.Event) {
    if (!event.type.startsWith("identity.verification_session.")) return { received: true };
    const session = event.data.object as Stripe.Identity.VerificationSession;
    const userId = session.metadata?.user_id;
    if (!userId) return { received: true };
    const lastErrorCode = session.last_error?.code || null;
    await this.database.withUser(userId, async (client) => {
      const accepted = await client.query(
        `INSERT INTO stripe_identity_webhook_events (event_id, event_type)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [event.id, event.type],
      );
      if (!accepted.rowCount) return;
      await client.query(
        `UPDATE identity_verification_sessions
         SET status = $1,
             last_error_code = $2,
             verified_at = CASE WHEN $1 = 'verified' THEN COALESCE(verified_at, now()) ELSE verified_at END,
             updated_at = now()
         WHERE user_id = $3 AND provider_session_id = $4`,
        [session.status, lastErrorCode, userId, session.id],
      );
    });
    return { received: true };
  }

  private faceDuplicateFingerprint(source: string) {
    const secret = process.env.FACE_TEMPLATE_FINGERPRINT_SECRET || process.env.VIDEO_SELFIE_ENCRYPTION_KEY;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException("Face template fingerprint secret is not configured.");
    }
    return createHmac("sha256", secret).update(source).digest("hex");
  }

  private async hasActiveFaceTemplate(userId: string) {
    return this.database.withUser(userId, async (client) => {
      const result = await client.query(
        `SELECT 1
           FROM biometric_face_templates
          WHERE user_id = $1
            AND status = 'active'
          LIMIT 1`,
        [userId],
      );
      return Boolean(result.rowCount);
    });
  }

  private encryptSecretPayload(value: string) {
    const secret = process.env.VIDEO_SELFIE_ENCRYPTION_KEY || process.env.ACCESS_TOKEN_SECRET;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException("Biometric encryption is not configured.");
    }
    const key = createHash("sha256").update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }
}
