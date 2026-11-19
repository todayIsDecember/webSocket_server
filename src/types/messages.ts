/**
 * Повідомлення, які клієнт надсилає серверу.
 */

export interface PrivateMessageRequest {
  type: "PRIVATE_MESSAGE";
  message: string;
  messageId: string;
  recipientId: number;
  senderName?: string;
}

export interface PublicMessageRequest {
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

export interface LeaveRoomRequest {
  type: "LEAVE_ROOM";
  roomId: number;
}

/**
 * Підтвердження, що клієнт отримав повідомлення.
 *
 * senderId — початковий відправник повідомлення.
 * Отримувача сервер визначає через WebSocket-з'єднання.
 */
export interface DeliveryAcknowledgment {
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

/**
 * Службові відповіді сервера.
 */

export interface ErrorResponse {
  type: "ERROR";
  message: string;
}

export interface SuccessResponse {
  type: "SUCCESS";
  message: string;
}

export interface MessageAcknowledgment {
  type: "MESSAGE_ACK";
  messageId: string;
  status: "ACCEPTED" | "DECLINED";
  chatId: string;
  sequenceNumber: number;
}

export interface MessageDelivered {
  type: "MESSAGE_DELIVERED";
  messageId: string;
  recipientId: number;
}

export type ServerResponse =
  | ErrorResponse
  | SuccessResponse
  | MessageAcknowledgment
  | MessageDelivered;

/**
 * Події доставки повідомлень отримувачам.
 */

export interface PublicMessageEvent {
  type: "PUBLIC_MESSAGE_RECEIVED";
  messageId: string;
  senderId: number;
  roomId: number;
  message: string;
  senderName: string;
  sequenceNumber: number;
  chatId: string;
}

export interface PrivateMessageEvent {
  type: "PRIVATE_MESSAGE_RECEIVED";
  messageId: string;
  senderId: number;
  message: string;
  senderName: string;
  sequenceNumber: number;
  chatId: string;
}

export type ServerEvent = PublicMessageEvent | PrivateMessageEvent;

// Усі повідомлення, які сервер може надіслати клієнту.
export type ServerMessage = ServerEvent | ServerResponse;
