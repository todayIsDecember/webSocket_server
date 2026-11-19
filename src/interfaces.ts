import WebSocket from "ws";

interface PrivateMessageRequest {
  type: "PRIVATE_MESSAGE";
  message: string;
  messageId: string;
  recipientId: number;
  senderName?: string;
}

interface PublicMessageRequest {
  type: "PUBLIC_MESSAGE";
  roomId: number;
  messageId: string;
  message: string;
  senderName?: string;
}

export interface JoinRoomRequest {
  type: "JOIN_ROOM";
  roomId: number;
}

interface LeaveRoomRequest {
  type: "LEAVE_ROOM";
  roomId: number;
}

export interface UserWebSocket extends WebSocket {
  isAlive: boolean;
  joinedRoomIds: Set<number>;
  userId: number;
  userName: string;
}

interface DeliveryAcknowledgment {
  type: "DELIVERED_ACK";
  messageId: string;
  senderId: number;
}

export type ClientMessage =
  | PrivateMessageRequest
  | PublicMessageRequest
  | JoinRoomRequest
  | LeaveRoomRequest
  | DeliveryAcknowledgment;

interface ErrorResponse {
  type: "ERROR";
  message: string;
}

interface SuccessResponse {
  type: "SUCCESS";
  message: string;
}

interface MessageAcknowledgment {
  type: "MESSAGE_ACK";
  messageId: string;
  status: "ACCEPTED" | "DECLAINED";
  chatId: string;
  sequenceNumber: number;
}

interface MessageDelivered {
  type: "MESSAGE_DELIVERED";
  messageId: string;
  recipientId: number;
}
export type ServerResponse =
  | ErrorResponse
  | SuccessResponse
  | MessageAcknowledgment
  | MessageDelivered;

interface PublicMessageEvent {
  type: "PUBLIC_MESSAGE_RECEIVED";
  messageId: string;
  senderId: number;
  roomId: number;
  message: string;
  senderName: string;
  sequenceNumber: number;
  chatId: string;
}

interface PrivateMessageEvent {
  type: "PRIVATE_MESSAGE_RECEIVED";
  messageId: string;
  senderId: number;
  message: string;
  senderName: string;
  sequenceNumber: number;
  chatId: string;
}

export interface PrivateMessageRecord {
  messageId: string;
  recipientId: number;
  senderId: number;
}

export type ServerEvent = PublicMessageEvent | PrivateMessageEvent;

export type ServerMessage = ServerEvent | ServerResponse;

export interface IPendingMessage {
  message: ClientMessage;
  ackTimeout: ReturnType<typeof setTimeout>;
  attemptNumber: number;
}

export interface MessageStorage {
  messageId: string;
  sequenceNumber: number;
}
