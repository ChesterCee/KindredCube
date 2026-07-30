import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";
import { ChatMessageResponse } from "./chat.service";

export type ReadyToMeetPresenceUpdate = {
  userId: string;
  available: boolean;
  availableAt?: string;
  expiresAt?: string;
  profile?: unknown;
};

@Injectable()
export class ChatRealtimeService {
  private readonly events = new EventEmitter();

  publish(message: ChatMessageResponse) {
    this.events.emit("message", message);
  }

  onMessage(listener: (message: ChatMessageResponse) => void) {
    this.events.on("message", listener);
    return () => this.events.off("message", listener);
  }

  publishReadyToMeetPresence(update: ReadyToMeetPresenceUpdate) {
    this.events.emit("ready-to-meet:presence", update);
  }

  onReadyToMeetPresence(listener: (update: ReadyToMeetPresenceUpdate) => void) {
    this.events.on("ready-to-meet:presence", listener);
    return () => this.events.off("ready-to-meet:presence", listener);
  }
}
