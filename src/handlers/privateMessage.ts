import WebSocket from "ws";
import type { UserWebSocket, PrivateMessageRequest } from "../types/index.js";

import { userConnections } from "../state.js";

import {
  findRegisteredMessage,
  registerMessage,
} from "../services/messageRegistry.js";

import { registerDelivery } from "../services/deliveryRegistry.js";

import { sendError, sendEvent, sendMessageAck } from "../services/responses.js";

/**
 * Обробляє приватне повідомлення.
 *
 * Послідовність роботи:
 * 1. Перевіряємо, чи повідомлення вже зареєстроване.
 * 2. Перевіряємо доступність отримувача.
 * 3. Створюємо унікальний ID приватного чату.
 * 4. Реєструємо повідомлення та його sequenceNumber.
 * 5. Реєструємо очікування DELIVERED_ACK.
 * 6. Надсилаємо повідомлення отримувачу.
 * 7. Надсилаємо MESSAGE_ACK відправнику.
 */

export const handlerPrivateMessage = (
  client: UserWebSocket,
  message: PrivateMessageRequest,
): void => {
  const { recipientId, messageId } = message;
  const existing = findRegisteredMessage(client.userId, messageId);

  if (existing) {
    sendMessageAck(client, messageId, existing);
    return;
  }

  const recipientSockets = userConnections.get(recipientId);
  if (!recipientSockets) {
    sendError(client, "Recipient is offline");
    return;
  }

  const isRecipientOnline = [...recipientSockets].some(
    (socket) => socket.readyState === WebSocket.OPEN,
  );

  if (!isRecipientOnline) {
    sendError(client, "Recipient is offline");
    return;
  }

  const chatId = `private:${[client.userId, recipientId].sort((a, b) => a - b).join(":")}`;

  const record = registerMessage(client.userId, messageId, chatId);

  registerDelivery(client.userId, messageId, chatId, [recipientId]);

  for (const socket of recipientSockets) {
    sendEvent(socket, {
      type: "PRIVATE_MESSAGE_RECEIVED",
      messageId,
      senderId: client.userId,
      senderName: message.senderName || client.userName,
      message: message.message,
      chatId: record.chatId,
      sequenceNumber: record.sequenceNumber,
    });
  }

  sendMessageAck(client, messageId, record);
};
