import WebSocket from "ws";

import type { ServerResponse, ServerEvent } from "../interfaces.js";

import type { RegisteredMessage } from "../types/index.js";

/**
 * Надсилає службову відповідь клієнту.
 *
 * Наприклад:
 * ERROR, SUCCESS, MESSAGE_ACK, MESSAGE_DELIVERED.
 *
 * Повертає false, якщо WebSocket-з'єднання
 * вже закрите або ще не готове до надсилання.
 *
 * Важливо: true означає, що send() викликано,
 * а не що отримувач гарантовано отримав дані.
 */

export const sendResponse = (
  client: WebSocket,
  response: ServerResponse,
): boolean => {
  if (client.readyState !== WebSocket.OPEN) return false;
  client.send(JSON.stringify(response));

  return true;
};

/**
 * Надсилає подію з повідомленням.
 *
 * Використовується для:
 * PRIVATE_MESSAGE_RECEIVED
 * PUBLIC_MESSAGE_RECEIVED
 */

export const sendEvent = (client: WebSocket, event: ServerEvent): boolean => {
  if (client.readyState !== WebSocket.OPEN) return false;
  client.send(JSON.stringify(event));

  return true;
};

/**
 * Надсилає повідомлення про помилку.
 *
 * Замість повторення JSON.stringify()
 * у кожному handler викликаємо sendError().
 */

export const sendError = (client: WebSocket, message: string): void => {
  sendResponse(client, {
    type: "ERROR",
    message,
  });
};

/**
 * Надсилає повідомлення про успішну операцію.
 *
 * Наприклад, коли користувач приєднався
 * до кімнати або вийшов із неї.
 */
export const sendSuccess = (client: WebSocket, message: string): void => {
  sendResponse(client, {
    type: "SUCCESS",
    message,
  });
};

/**
 * Підтверджує відправнику, що сервер
 * прийняв і зареєстрував його повідомлення.
 *
 * Якщо клієнт повторно надіслав повідомлення
 * через Retry, можемо повторити той самий ACK
 * з початковим sequenceNumber.
 *
 * Це НЕ підтвердження доставки отримувачу.
 * За доставку відповідає DELIVERED_ACK.
 */

export const sendMessageAck = (
  client: WebSocket,
  messageId: string,
  record: RegisteredMessage,
): void => {
  sendResponse(client, {
    type: "MESSAGE_ACK",
    messageId,
    status: "ACCEPTED",
    chatId: record.chatId,
    sequenceNumber: record.sequenceNumber,
  });
};
