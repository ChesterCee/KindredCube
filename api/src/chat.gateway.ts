import { Inject, OnModuleDestroy, OnModuleInit, UsePipes, ValidationPipe } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { IsIn, IsObject, IsUUID } from "class-validator";
import { Server, Socket } from "socket.io";
import { TokenService } from "./auth/token.service";
import { ChatContentKind, ChatPayload, ChatService } from "./chat.service";
import { ChatRealtimeService } from "./chat-realtime.service";
import { PushNotificationsService } from "./push-notifications.service";

class SocketChatMessageDto {
  @IsUUID()
  recipientId!: string;

  @IsIn(["text", "gif", "image", "audio", "video", "meeting_proposal", "meeting_response"])
  kind!: ChatContentKind;

  @IsObject()
  payload!: ChatPayload;
}

type AuthenticatedSocket = Socket & {
  data: {
    user?: { id: string; sessionId: string };
  };
};

@WebSocketGateway({
  namespace: "/chats",
  cors: {
    origin: process.env.NODE_ENV === "production"
      ? (process.env.ALLOWED_ORIGINS || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : true,
    methods: ["GET", "POST"],
  },
})
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ChatGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  private readonly server!: Server;
  private readonly connectedUsers = new Map<string, number>();
  private unsubscribeRealtime: (() => void) | null = null;
  private unsubscribeReadyToMeet: (() => void) | null = null;

  constructor(
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(ChatService) private readonly chats: ChatService,
    @Inject(ChatRealtimeService) private readonly realtime: ChatRealtimeService,
    @Inject(PushNotificationsService) private readonly push: PushNotificationsService,
  ) {}

  onModuleInit() {
    this.unsubscribeRealtime = this.realtime.onMessage((message) => {
      this.server.to(userRoom(message.senderId)).to(userRoom(message.recipientId)).emit("chat:message", message);
      this.push.sendMessageNotification(message.recipientId, message.senderId, message.id).catch(() => undefined);
    });
    this.unsubscribeReadyToMeet = this.realtime.onReadyToMeetPresence((update) => {
      this.server.emit("ready-to-meet:presence", update);
    });
  }

  onModuleDestroy() {
    this.unsubscribeRealtime?.();
    this.unsubscribeReadyToMeet?.();
  }

  async handleConnection(socket: AuthenticatedSocket) {
    try {
      const token = tokenFromSocket(socket);
      const claims = await this.tokens.verifyAccessToken(token);
      socket.data.user = { id: claims.sub, sessionId: claims.sid };
      await socket.join(userRoom(claims.sub));
      this.connectedUsers.set(claims.sub, (this.connectedUsers.get(claims.sub) || 0) + 1);
      socket.on("disconnect", () => {
        const count = Math.max(0, (this.connectedUsers.get(claims.sub) || 1) - 1);
        if (count) this.connectedUsers.set(claims.sub, count);
        else this.connectedUsers.delete(claims.sub);
      });
      socket.emit("chat:ready", { userId: claims.sub });
    } catch {
      socket.emit("chat:error", { message: "Chat connection is not authorized." });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage("chat:send")
  async sendMessage(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() input: SocketChatMessageDto,
  ) {
    const user = socket.data.user;
    if (!user) return { ok: false, message: "Chat connection is not authorized." };
    try {
      const message = await this.chats.sendMessage(user.id, input.recipientId, input.kind, input.payload);
      this.realtime.publish(message);
      return { ok: true, message };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Message could not be sent.";
      return { ok: false, message };
    }
  }
}

function tokenFromSocket(socket: Socket) {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken) return authToken;
  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === "string" && queryToken) return queryToken;
  throw new Error("Missing token");
}

function userRoom(userId: string) {
  return `user:${userId}`;
}
