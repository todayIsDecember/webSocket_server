import WebSocket from "ws";

export interface PrivateMessage {
  type: "PRIVATE_MESSAGE";
  message: string;
  messageId: string;
  to: number;
}

export interface PublicMessage {
  type: "PUBLIC_MESSAGE";
  room: number;
  messageId: string;
  message: string;
}

export interface JoinRoom {
  type: "JOIN_ROOM";
  roomId: number;
}

export interface LeaveRoom {
  type: "LEAVE_ROOM";
  roomId: number;
}

export interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  rooms: Set<number>;
  user_id: number;
}

export interface MessageAck {
  type: "MESSAGE_ACK";
  message_id: string;
  status: "ACCEPTED" | "DECLAINED";
}

export type ClientMessage =
  | PrivateMessage
  | PublicMessage
  | JoinRoom
  | LeaveRoom;

interface ErrorMessage {
  type: "ERROR";
  message: string;
}

interface SuccessMessage {
  type: "SUCCESS";
  message: string;
}

interface AckMessage {
  type: "MESSAGE_ACK";
  messageId: string;
  status: "ACCEPTED" | "DECLAINED";
}

export type ServerResponse = ErrorMessage | SuccessMessage | AckMessage;

interface PublicMessageReceived {
  type: "PUBLIC_MESSAGE_RECEIVED";
  messageId: string;
  from: number;
  room: number;
  message: string;
}

interface PrivateMessageReceived {
  type: "PRIVATE_MESSAGE_RECEIVED";
  messageId: string;
  from: number;
  message: string;
}

export type ServerEvent = PublicMessageReceived | PrivateMessageReceived;

export type ServerMessage = ServerEvent | ServerResponse;

export interface IPendingMessage {
  messageId: string;
  message: string;
  timeOut: ReturnType<typeof setTimeout>;
}
