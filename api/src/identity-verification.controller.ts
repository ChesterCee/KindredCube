import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { IdentityVerificationService } from "./identity-verification.service";
import { PaymentsService } from "./payments.service";

class VideoSelfieVerificationDto {
  @IsString()
  @MaxLength(21_000_000)
  videoBase64!: string;

  @IsIn(["video/mp4", "video/quicktime", "video/mov"])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(15 * 1024 * 1024)
  sizeBytes!: number;

  @IsBoolean()
  consentAccepted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(7_000_000)
  faceImageBase64?: string;

  @IsOptional()
  @IsIn(["image/jpeg", "image/png", "image/webp"])
  faceImageMimeType?: string;
}

@Controller("v1/verification")
@UseGuards(AccessTokenGuard)
export class IdentityVerificationController {
  constructor(@Inject(IdentityVerificationService) private readonly verification: IdentityVerificationService) {}

  @Post("session")
  create(@Req() request: AuthenticatedRequest) {
    return this.verification.createSession(request.user.id);
  }

  @Get("status")
  status(@Req() request: AuthenticatedRequest) {
    return this.verification.status(request.user.id);
  }

  @Post("video-selfie")
  videoSelfie(@Req() request: AuthenticatedRequest, @Body() input: VideoSelfieVerificationDto) {
    return this.verification.createVideoSelfie(request.user.id, input);
  }
}

@Controller("v1/webhooks/stripe")
export class StripeIdentityWebhookController {
  constructor(
    @Inject(IdentityVerificationService)
    private readonly verification: IdentityVerificationService,
    @Inject(PaymentsService)
    private readonly payments: PaymentsService,
  ) {}

  @Post()
  @HttpCode(200)
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature?: string,
  ) {
    if (!request.rawBody || !signature) throw new BadRequestException("A signed Stripe payload is required.");
    let event;
    try {
      event = this.verification.constructWebhook(request.rawBody, signature);
    } catch {
      throw new BadRequestException("The Stripe webhook signature is invalid.");
    }
    return Promise.all([
      this.verification.processWebhook(event),
      this.payments.processWebhook(event),
    ]).then(() => ({ received: true }));
  }
}
