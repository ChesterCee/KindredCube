import { BadRequestException, Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { PushNotificationsService } from "./push-notifications.service";

class RegisterPushTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  token!: string;

  @IsIn(["ios", "android", "web", "unknown"])
  platform!: "ios" | "android" | "web" | "unknown";
}

@Controller("v1/notifications")
@UseGuards(AccessTokenGuard)
export class PushNotificationsController {
  constructor(@Inject(PushNotificationsService) private readonly push: PushNotificationsService) {}

  @Post("push-token")
  async register(@Req() request: AuthenticatedRequest, @Body() input: RegisterPushTokenDto) {
    try {
      return await this.push.registerToken(request.user.id, input.token, input.platform);
    } catch {
      throw new BadRequestException("A valid push notification token is required.");
    }
  }

  @Get("push-diagnostics")
  diagnostics(@Req() request: AuthenticatedRequest) {
    return this.push.diagnostics(request.user.id);
  }

  @Post("test-push")
  sendTestPush(@Req() request: AuthenticatedRequest) {
    return this.push.sendTestNotification(request.user.id);
  }
}
