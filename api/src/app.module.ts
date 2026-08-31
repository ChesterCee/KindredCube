import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth/auth.controller";
import { AccessTokenGuard } from "./auth/auth.guard";
import { AuthService } from "./auth/auth.service";
import { PasswordService } from "./auth/password.service";
import { TokenService } from "./auth/token.service";
import { DatabaseService } from "./database.service";
import { EmailService } from "./email.service";
import { PrivateSpaceController } from "./private-space.controller";
import { MemberSafetyController } from "./member-safety.controller";
import { IdentityVerificationController, StripeIdentityWebhookController } from "./identity-verification.controller";
import { IdentityVerificationService } from "./identity-verification.service";
import { SystemMessagesController } from "./system-messages.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { GifsController } from "./gifs.controller";
import { MapsController } from "./maps.controller";
import { DiscoveryController } from "./discovery.controller";
import { MemberLikesController } from "./member-likes.controller";
import { AdminModerationController } from "./admin-moderation.controller";
import { HelpContentController } from "./help-content.controller";
import { LegalContentController } from "./legal-content.controller";
import { PendingAccountCleanupService } from "./pending-account-cleanup.service";
import { HealthController } from "./health.controller";
import { ChatController } from "./chat.controller";
import { ChatGateway } from "./chat.gateway";
import { ChatRealtimeService } from "./chat-realtime.service";
import { ChatService } from "./chat.service";
import { PushNotificationsController } from "./push-notifications.controller";
import { PushNotificationsService } from "./push-notifications.service";
import { NotificationWorkerService } from "./notification-worker.service";
import { PostMeetChecksController } from "./post-meet-checks.controller";
import { SupportController, SupportEmailRepliesController } from "./support.controller";
import { InstagramController } from "./instagram.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 60 }]),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.ACCESS_TOKEN_SECRET || "";
        if (secret.length < 32) throw new Error("ACCESS_TOKEN_SECRET must be at least 32 characters");
        return { secret };
      },
    }),
  ],
  controllers: [
    AuthController,
    PrivateSpaceController,
    MemberSafetyController,
    IdentityVerificationController,
    StripeIdentityWebhookController,
    SystemMessagesController,
    PaymentsController,
    GifsController,
    MapsController,
    DiscoveryController,
    MemberLikesController,
    AdminModerationController,
    HelpContentController,
    LegalContentController,
    ChatController,
    PushNotificationsController,
    PostMeetChecksController,
    SupportController,
    SupportEmailRepliesController,
    InstagramController,
    HealthController,
  ],
  providers: [
    DatabaseService,
    EmailService,
    PasswordService,
    TokenService,
    AuthService,
    AccessTokenGuard,
    IdentityVerificationService,
    PaymentsService,
    PendingAccountCleanupService,
    ChatService,
    ChatRealtimeService,
    ChatGateway,
    PushNotificationsService,
    NotificationWorkerService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
