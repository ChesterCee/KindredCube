import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsObject, IsString, IsUUID, MaxLength } from "class-validator";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { ChatRealtimeService } from "./chat-realtime.service";
import { ChatContentKind, ChatPayload, ChatService } from "./chat.service";

class SendChatMessageDto {
  @IsUUID()
  recipientId!: string;

  @IsIn(["text", "gif", "image", "audio", "video", "meeting_proposal", "meeting_response"])
  kind!: ChatContentKind;

  @IsObject()
  payload!: ChatPayload;
}

class EditChatMessageDto {
  @IsString()
  @MaxLength(2000)
  text!: string;
}

class ReactChatMessageDto {
  @IsString()
  emoji!: string;
}

@Controller("v1/chats")
@UseGuards(AccessTokenGuard)
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chats: ChatService,
    @Inject(ChatRealtimeService) private readonly realtime: ChatRealtimeService,
  ) {}

  @Get()
  conversations(@Req() request: AuthenticatedRequest) {
    return this.chats.listConversations(request.user.id);
  }

  @Get(":profileId/messages")
  messages(@Req() request: AuthenticatedRequest, @Param("profileId") profileId: string) {
    return this.chats.listMessages(request.user.id, profileId);
  }

  @Post("messages")
  async send(@Req() request: AuthenticatedRequest, @Body() input: SendChatMessageDto) {
    const message = await this.chats.sendMessage(request.user.id, input.recipientId, input.kind, input.payload);
    this.realtime.publish(message);
    return message;
  }

  @Patch("messages/:messageId")
  async edit(@Req() request: AuthenticatedRequest, @Param("messageId") messageId: string, @Body() input: EditChatMessageDto) {
    const message = await this.chats.editMessage(request.user.id, messageId, input.text);
    this.realtime.publish(message);
    return message;
  }

  @Post("messages/:messageId/unsend")
  async unsend(@Req() request: AuthenticatedRequest, @Param("messageId") messageId: string) {
    const message = await this.chats.unsendMessage(request.user.id, messageId);
    this.realtime.publish(message);
    return message;
  }

  @Post("messages/:messageId/reaction")
  async react(@Req() request: AuthenticatedRequest, @Param("messageId") messageId: string, @Body() input: ReactChatMessageDto) {
    const message = await this.chats.reactToMessage(request.user.id, messageId, input.emoji);
    this.realtime.publish(message);
    return message;
  }

  @Delete("messages/:messageId")
  deleteForMe(@Req() request: AuthenticatedRequest, @Param("messageId") messageId: string) {
    return this.chats.deleteMessageForMe(request.user.id, messageId);
  }
}
