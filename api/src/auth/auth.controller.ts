import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Redirect,
  Req,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { AuthService } from "./auth.service";
import {
  CompleteEmailLoginDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  UpdateUsernameDto,
} from "./auth.dto";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth.guard";
import { TokenService } from "./token.service";

@Controller("v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(TokenService)
    private readonly tokens: TokenService,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Get("verify-email")
  @Redirect()
  @Header("Cache-Control", "no-store")
  async verifyEmail(@Query("token") token = "") {
    const result = await this.auth.verifyEmail(token);
    const deepLink = new URL(process.env.APP_DEEP_LINK || "kindredcube://verify-email");
    deepLink.searchParams.set("status", result.verified ? "verified" : "invalid");
    if (result.verified) deepLink.searchParams.set("ticket", result.ticket);
    return { url: deepLink.toString(), statusCode: HttpStatus.FOUND };
  }

  @Post("complete-email-login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  completeEmailLogin(@Body() input: CompleteEmailLoginDto, @Req() request: Request) {
    return this.tokens.exchangeEmailLoginTicket(
      input.ticket,
      input.deviceName,
      request.headers["user-agent"] || "unknown",
    );
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendVerification(@Body() input: ResendVerificationDto) {
    return this.auth.resendVerification(input.email);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() input: ForgotPasswordDto) {
    return this.auth.forgotPassword(input.email);
  }

  @Post("me/request-password-reset")
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestSignedInPasswordReset(@Req() request: AuthenticatedRequest) {
    return this.auth.requestSignedInPasswordReset(request.user.id);
  }

  @Get("reset-password")
  @Redirect()
  @Header("Cache-Control", "no-store")
  async openPasswordReset(@Query("token") token = "") {
    const deepLink = new URL(
      process.env.APP_RESET_PASSWORD_DEEP_LINK || "kindredcube://reset-password",
    );
    deepLink.searchParams.set("token", token);
    if (await this.auth.passwordResetRequiresCurrentPassword(token)) {
      deepLink.searchParams.set("requiresCurrentPassword", "1");
    }
    return { url: deepLink.toString(), statusCode: HttpStatus.FOUND };
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() input: ResetPasswordDto) {
    return this.auth.resetPassword(input.token, input.password, input.currentPassword);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  login(@Body() input: LoginDto, @Req() request: Request) {
    return this.auth.login(input, request.headers["user-agent"] || "unknown");
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() input: RefreshDto) {
    return this.tokens.rotate(input.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() input: RefreshDto) {
    return this.tokens.revoke(input.refreshToken);
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.me(request.user.id);
  }

  @Put("me/username")
  @UseGuards(AccessTokenGuard)
  updateUsername(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateUsernameDto,
  ) {
    return this.auth.updateUsername(request.user.id, input.username);
  }

  @Post("delete-account")
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.OK)
  deleteAccount(
    @Req() request: AuthenticatedRequest,
    @Body() input: { reasons?: string[]; details?: string },
  ) {
    return this.auth.deleteAccount(request.user.id, input);
  }
}
